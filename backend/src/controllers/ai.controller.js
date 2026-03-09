import Anthropic from '@anthropic-ai/sdk';
import prisma from '../config/prisma.js';

const USE_MOCK = process.env.USE_MOCK_AI === 'true';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const MAX_FILE_COUNT = 10;
const MAX_CHARS_PER_FILE = 12000;
const MAX_TOTAL_CHARS = 60000;
const AI_REQUEST_TIMEOUT_MS = Number.isFinite(Number(process.env.AI_REQUEST_TIMEOUT_MS))
  && Number(process.env.AI_REQUEST_TIMEOUT_MS) > 0
  ? Math.floor(Number(process.env.AI_REQUEST_TIMEOUT_MS))
  : 45_000;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'mixed']);
const ALLOWED_QUESTION_TYPES = new Set(['mcq', 'short', 'essay', 'mixed']);

let anthropicClient = null;

const getAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }

  return anthropicClient;
};

const isAdminUser = async (userId) => {
  if (!userId) {
    return false;
  }

  const user = await prisma.userAuth.findUnique({ where: { id: userId } });
  return user?.username === 'admin';
};

const sanitizeFileIds = (fileIds) => {
  if (!Array.isArray(fileIds)) {
    return [];
  }

  return [...new Set(fileIds.map((id) => String(id).trim()).filter(Boolean))];
};

const stripCodeFence = (text) => {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
};

const parseModelJson = (rawText) => {
  const cleaned = stripCodeFence(rawText);
  return JSON.parse(cleaned);
};

const getTextFromResponse = (response) => {
  return (response?.content || [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
};

const parseOptionalCount = ({ rawValue, min, max, defaultValue, fieldName }) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { value: defaultValue };
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed)) {
    return { error: `${fieldName} must be an integer.` };
  }

  if (parsed < min || parsed > max) {
    return { error: `${fieldName} must be between ${min} and ${max}.` };
  }

  return { value: parsed };
};

const parseOptionalEnum = ({ rawValue, allowedValues, defaultValue, fieldName }) => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return { value: defaultValue };
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (!allowedValues.has(normalized)) {
    return { error: `${fieldName} is invalid.` };
  }

  return { value: normalized };
};

const mapClaudeError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || error?.response?.status);

  if (code === 'AI_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || status === 504) {
    return { status: 504, message: 'AI request timed out.' };
  }

  if (['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return { status: 503, message: 'Network error while contacting AI service.' };
  }

  if (status === 413) {
    return { status: 413, message: 'AI request is too large. Reduce files or content size.' };
  }

  if (status === 429) {
    return { status: 429, message: 'AI service is busy. Please try again shortly.' };
  }

  if (status === 529) {
    return { status: 529, message: 'AI service is overloaded. Please try again later.' };
  }

  if (status === 401 || status === 403) {
    return { status: 500, message: 'AI authentication failed. Check AI provider credentials.' };
  }

  return null;
};

const getAccessibleFiles = async (userId, fileIds) => {
  const ids = sanitizeFileIds(fileIds);

  if (ids.length === 0) {
    return { error: { status: 400, message: 'fileIds is required.' } };
  }

  if (ids.length > MAX_FILE_COUNT) {
    return { error: { status: 400, message: `You can analyze up to ${MAX_FILE_COUNT} files at a time.` } };
  }

  const isAdmin = await isAdminUser(userId);

  const files = await prisma.file.findMany({
    where: isAdmin
      ? { id: { in: ids } }
      : {
          id: { in: ids },
          OR: [
            { permissions: { some: { userId } } },
            { isPublic: true },
          ]
        },
    select: {
      id: true,
      originalName: true,
      extractedText: true,
      fileType: true,
    },
  });

  if (files.length !== ids.length) {
    return { error: { status: 403, message: 'One or more files are inaccessible.' } };
  }

  return { files };
};

const buildContext = (files) => {
  let total = 0;

  const sections = files.map((file) => {
    const fullText = (file.extractedText || '').trim();
    let text = fullText.slice(0, MAX_CHARS_PER_FILE);

    if (total >= MAX_TOTAL_CHARS) {
      text = '';
    } else if (total + text.length > MAX_TOTAL_CHARS) {
      text = text.slice(0, MAX_TOTAL_CHARS - total);
    }

    total += text.length;

    const label = file.fileType === 'pyp' ? 'PAST EXAM PAPER' : 'STUDY NOTES';

    return `${label}
    File ID: ${file.id}
    File Name: ${file.originalName}
    Content:
    ${text}`;
  });

  return sections.join('\n\n---\n\n');
};

const requestClaudeJson = async ({ taskPrompt, context, maxTokens = 1500 }) => {
  if (USE_MOCK) { // for development
    console.log('MOCK MODE: Returning fake AI response');
    console.log('Task prompt:', `${String(taskPrompt || '').slice(0, 100)}...`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const prompt = String(taskPrompt || '');
    const lowerPrompt = prompt.toLowerCase();
    const count = Number(prompt.match(/Create\s+(\d+)/i)?.[1]) || 8;

    if (lowerPrompt.includes('flashcards')) {
      return {
        data: {
          flashcards: Array.from({ length: count }, (_, index) => ({
            front: `Mock flashcard ${index + 1}: What is a key idea from this topic?`,
            back: `Mock answer ${index + 1}: This is a concise explanation for revision practice.`,
          })),
        },
      };
    }

    if (lowerPrompt.includes('study questions') || lowerPrompt.includes(' questions from the source content')) {
      const parsedType = lowerPrompt.match(/difficulty\s+(mcq|short|essay|mixed)\s+(?:study\s+)?questions/i)?.[1] || 'mixed';
      const parsedDifficulty = lowerPrompt.match(/create\s+\d+\s+(easy|medium|hard|mixed)\s+difficulty/i)?.[1] || 'medium';

      const types = parsedType === 'mixed' ? ['mcq', 'short', 'essay'] : [parsedType];
      const difficulties = parsedDifficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [parsedDifficulty];

      return {
        data: {
          questions: Array.from({ length: count }, (_, index) => {
            const type = types[index % types.length];
            const difficulty = difficulties[index % difficulties.length];
            const baseQuestion = {
              question: `Mock ${type} question ${index + 1}: Explain the main concept from the provided files.`,
              answer:
                type === 'essay'
                  ? `Mock detailed answer ${index + 1}: This would include a deeper analysis with key arguments and examples.`
                  : type === 'mcq'
                    ? `Correct answer: B. Mock explanation ${index + 1}: This option best matches the concept from the source material.`
                    : `Mock answer ${index + 1}: A concise explanation of the core concept.`,
              difficulty,
              type,
            };

            if (type === 'mcq') {
              return {
                ...baseQuestion,
                options: [
                  'A) First option (incorrect)',
                  'B) Second option (correct)',
                  'C) Third option (incorrect)',
                  'D) Fourth option (incorrect)',
                ],
                correctOption: 'B',
              };
            }

            return baseQuestion;
          }),
        },
      };
    }

    return {
      data: {
        message: 'Mock response generated',
        content: 'This is a mock AI response for development purposes.',
      },
    };
  }

  const client = getAnthropicClient();

  if (!client) {
    return { error: { status: 500, message: 'ANTHROPIC_API_KEY is not configured.' } };
  }

  let timeoutId = null;

  try {
    const requestPromise = client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      system:
        'You are an academic study assistant. Use only the provided file content. Return ONLY valid JSON with no markdown fences.',
      messages: [
        {
          role: 'user',
          content: `${taskPrompt}\n\nSource content:\n${context}`,
        },
      ],
    });

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new Error('AI request timed out.');
        timeoutError.code = 'AI_TIMEOUT';
        reject(timeoutError);
      }, AI_REQUEST_TIMEOUT_MS);
    });

    const response = await Promise.race([requestPromise, timeoutPromise]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const rawText = getTextFromResponse(response);
    const parsed = parseModelJson(rawText);
    return { data: parsed };
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error instanceof SyntaxError) {
      return { error: { status: 502, message: 'AI returned invalid JSON format.' } };
    }

    const mappedError = mapClaudeError(error);
    if (mappedError) {
      return { error: mappedError };
    }

    console.error('Claude API error:', error);
    return { error: { status: 502, message: 'AI request failed.' } };
  }
};

const handleAiTask = async (req, res, taskBuilder, maxTokens) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const { fileIds } = req.body || {};

  try {
    const { files, error: fileError } = await getAccessibleFiles(userId, fileIds);

    if (fileError) {
      return res.status(fileError.status).json(fileError);
    }

    const context = buildContext(files);
    const taskPrompt = taskBuilder(req.body || {});

    const { data, error: aiError } = await requestClaudeJson({
      taskPrompt,
      context,
      maxTokens,
    });

    if (aiError) {
      return res.status(aiError.status).json(aiError);
    }

    return res.json({
      fileIds: files.map((file) => file.id),
      result: data,
    });
  } catch (error) {
    console.error('AI task error:', error);
    return res.status(500).json({ message: 'Failed to process AI request.' });
  }
};

export const generateQuestions = async (req, res) => {
  const body = req.body || {};

  const countValidation = parseOptionalCount({
    rawValue: body.count,
    min: 3,
    max: 20,
    defaultValue: 8,
    fieldName: 'count',
  });

  if (countValidation.error) {
    return res.status(400).json({ message: countValidation.error });
  }

  const difficultyValidation = parseOptionalEnum({
    rawValue: body.difficulty,
    allowedValues: ALLOWED_DIFFICULTIES,
    defaultValue: 'medium',
    fieldName: 'difficulty',
  });

  if (difficultyValidation.error) {
    return res.status(400).json({ message: difficultyValidation.error });
  }

  const questionTypeValidation = parseOptionalEnum({
    rawValue: body.type ?? body.questionType,
    allowedValues: ALLOWED_QUESTION_TYPES,
    defaultValue: 'mixed',
    fieldName: 'type',
  });

  if (questionTypeValidation.error) {
    return res.status(400).json({ message: questionTypeValidation.error });
  }

  const count = countValidation.value;
  const difficulty = difficultyValidation.value;
  const questionType = questionTypeValidation.value;

  return handleAiTask(
    req,
    res,
    () => {
      let typeInstructions = '';

      if (questionType === 'mcq' || questionType === 'mixed') {
        typeInstructions += `
For multiple choice questions (MCQ):
- Provide 4 options labeled A, B, C, D
- Mark the correct answer
- Make distractors plausible but clearly wrong`;
      }

      if (questionType === 'short' || questionType === 'mixed') {
        typeInstructions += `
For short answer questions:
- Questions that can be answered in 2-3 sentences
- Provide concise, factual answers`;
      }

      if (questionType === 'essay' || questionType === 'mixed') {
        typeInstructions += `
For essay questions:
- Questions requiring detailed explanation
- Provide comprehensive answers with key points`;
      }

      return `Create ${count} ${difficulty} difficulty ${questionType} questions from the source content.

Difficulty guidelines:
- easy: Basic recall and understanding questions
- medium: Application and analysis questions
- hard: Synthesis and evaluation questions
- mixed: Variety of all difficulty levels

${typeInstructions}

Return JSON with this exact shape: {
  "questions": [{
    "question": "...",
    "answer": "...",
    "difficulty": "easy|medium|hard",
    "type": "mcq|short|essay",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctOption": "B"
  }]
}

Rules:
- For MCQ: MUST include options array and correctOption
- For short/essay: Do NOT include options or correctOption
- Keep answers concise and factual`;
    },
    1800
  );
};

export const generateFlashcards = async (req, res) => {
  const body = req.body || {};

  const countValidation = parseOptionalCount({
    rawValue: body.count,
    min: 5,
    max: 30,
    defaultValue: 12,
    fieldName: 'count',
  });

  if (countValidation.error) {
    return res.status(400).json({ message: countValidation.error });
  }

  const difficultyValidation = parseOptionalEnum({
    rawValue: body.difficulty,
    allowedValues: ALLOWED_DIFFICULTIES,
    defaultValue: 'medium',
    fieldName: 'difficulty',
  });

  if (difficultyValidation.error) {
    return res.status(400).json({ message: difficultyValidation.error });
  }

  const count = countValidation.value;
  const difficulty = difficultyValidation.value;

  return handleAiTask(
    req,
    res,
    () => {
      return `Create ${count} ${difficulty} difficulty flashcards from the source content.

Difficulty guidelines:
- easy: Focus on core facts and direct definitions
- medium: Include conceptual links and common applications
- hard: Emphasize nuanced distinctions and advanced reasoning
- mixed: Use a balanced mix of all levels

    Return JSON with this exact shape: {"flashcards":[{"front":"...","back":"..."}]}

    Rules:
    - front: a short prompt or term for the front face of a flip card
    - back: the concise explanation/answer for the back face
    - plain text only (no markdown or bullet symbols)
    - keep each side brief enough for a small card layout`;
    },
    1800
  );
};


