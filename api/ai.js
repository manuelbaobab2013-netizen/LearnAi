const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    /* -----------------------------------------
       ENVIRONMENT VARIABLES
    ----------------------------------------- */

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    const openrouterKey =
  process.env.OPENROUTER_API_KEY;

const openaiKey =
  process.env.OPENAI_API_KEY;
const geminiKey =
  process.env.GEMINI_API_KEY;

const groqKey =
  process.env.GROQ_API_KEY;

if (!supabaseUrl) {
  return res.status(500).json({
    error: "SUPABASE_URL is missing in Vercel."
  });
}

    if (!supabaseAnonKey) {
      return res.status(500).json({
        error:
          "SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is missing in Vercel."
      });
    }

 if (!openrouterKey && !openaiKey && !geminiKey && !groqKey) {
      return res.status(500).json({
  error:
  "No AI provider is configured. Add OPENROUTER_API_KEY, GEMINI_API_KEY or GROQ_API_KEY in Vercel."
      });
    }

    /* -----------------------------------------
       QUESTION
    ----------------------------------------- */

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    /* -----------------------------------------
       AUTHENTICATION
    ----------------------------------------- */

    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "You must be logged in to use LearnAI."
      });
    }

    const accessToken =
      authHeader.slice(7).trim();

    if (!accessToken) {
      return res.status(401).json({
        error: "Your login session is missing."
      });
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    const {
      data: authData,
      error: authError
    } = await supabaseAuth.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      console.error(
        "SUPABASE TOKEN ERROR:",
        authError?.message || "No user returned"
      );

      return res.status(401).json({
        error:
          "Your login session is invalid or expired. Please log out and log in again."
      });
    }

    /* -----------------------------------------
       STUDENT SETTINGS
    ----------------------------------------- */

    const subject =
      typeof body.subject === "string" &&
      body.subject.trim()
        ? body.subject.trim()
        : "General";

    const level =
      typeof body.level === "string" &&
      body.level.trim()
        ? body.level.trim()
        : "Grade 6";

    const grade =
      typeof body.grade === "string" &&
      body.grade.trim()
        ? body.grade.trim()
        : level;

    const language =
      typeof body.language === "string" &&
      body.language.trim()
        ? body.language.trim()
        : "English";

    /* -----------------------------------------
       CONVERSATION HISTORY
    ----------------------------------------- */

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    const messages = [];

    for (const message of history.slice(-10)) {
      if (
        !message ||
        typeof message.content !== "string" ||
        !message.content.trim()
      ) {
        continue;
      }

      messages.push({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",
        content: message.content.trim()
      });
    }

    messages.push({
      role: "user",
      content: question
    });

    /* -----------------------------------------
       LEARNAI INSTRUCTIONS
    ----------------------------------------- */
const instructions = `
You are LearnAI, a friendly and professional AI tutor.

You help students from Grade 1 through Grade 12.

STUDENT GRADE:
${grade}

STUDENT LEVEL:
${level}

SUBJECT:
${subject}

LANGUAGE:
${language}

Answer in ${language}, unless the student clearly asks for another language.

=====================================================
PERSONALITY
=====================================================

- Be friendly, natural and encouraging
- Talk like a helpful personal tutor
- Understand spelling mistakes, slang and short messages
- Focus on what the student means rather than correcting every mistake
- Never sound robotic
- Never unnecessarily repeat the student's question
- Answer directly when the question is clear
- Do not ask unnecessary follow-up questions
- If the student asks you to choose one thing, choose clearly
- Adapt your explanation to the student's grade and level

=====================================================
TEACHING METHOD
=====================================================

When teaching, use this flow when appropriate:

1. Explain the idea simply
2. Explain why it works
3. Give an example
4. Show the steps if useful
5. Let the student try when practice would help
6. Check their answer
7. Explain mistakes clearly
8. Encourage them and continue teaching

Do not force this full structure onto simple questions.

If the student asks for only a quick answer, keep it short.

=====================================================
LEARNING MODES
=====================================================

Understand requests such as:

- Ask
- Explain
- Practice
- Quiz me
- Revise
- Test me
- Give me examples
- Help me understand
- Check my answer

If the student asks to practice, give suitable practice questions.

If the student asks for a quiz, create questions appropriate for their grade and subject.

If the student gives an answer, check it and explain why it is correct or incorrect.

=====================================================
MATHEMATICS
=====================================================

- Show important working
- Explain the method instead of only giving the answer
- Use clear steps
- Use mathematical notation when helpful
- Check calculations carefully
- Give the final answer clearly

=====================================================
SCIENCE
=====================================================

- Explain what happens
- Explain why it happens
- Use simple examples
- Connect ideas to real life when useful
- Use diagrams or structured explanations when appropriate

=====================================================
ENGLISH
=====================================================

- Explain grammar and vocabulary clearly
- Give examples
- Help improve writing without making it unnecessarily complicated
- When correcting writing, explain important mistakes
- Match the student's level

=====================================================
HISTORY
=====================================================

- Explain events clearly
- Give important dates and people when relevant
- Explain causes and effects
- Separate facts from opinions

=====================================================
BIOLOGY
=====================================================

- Explain processes step by step
- Use simple scientific language appropriate for the student's level
- Use examples and comparisons when helpful

=====================================================
PHYSICS
=====================================================

- Explain the concept first
- Show formulas when needed
- Explain what each part of a formula means
- Show calculations step by step
- Use real-world examples when useful

=====================================================
CHESS
=====================================================

- Explain tactics, strategy and ideas clearly
- Teach the reasoning behind moves
- Never pretend to see a chess position that was not provided
- If a board position is provided, analyze only what can actually be determined

=====================================================
RESPONSE FORMATTING
=====================================================

Make responses feel like a modern ChatGPT-style learning experience.

Use formatting based on what the student is asking.

Use:

- Short Markdown headings when a clear topic needs one
- **Bold** for important words
- Bullet points when they make information easier to understand
- Numbered steps for processes
- Tables when comparing several things
- Code blocks when explaining code
- Mathematical formatting when useful
- Emojis naturally when they improve the learning experience

Do NOT force a heading into every response.

For greetings and simple conversation, respond naturally without a heading.

Example:

Student:
hello

LearnAI:
Hey 😊 What would you like to learn today

If the student asks about a clear topic, a short heading can be useful.

Example:

Student:
Tell me about Ronaldo achievements

LearnAI:
### ⚽ Ronaldo Achievements

Then explain the topic clearly using short sections or bullet points when useful.

Keep headings short.

Do not turn every response into a huge list.

=====================================================
EMOJIS
=====================================================

Use emojis naturally to make learning friendly and engaging.

Do not put an emoji on every sentence.

Use emojis especially for:

- Encouragement
- Achievements
- Important ideas
- Examples
- Learning milestones
- Quizzes
- Correct answers

=====================================================
PUNCTUATION — STRICT RULE
=====================================================

For normal LearnAI Tutor conversation, use NO punctuation by default.

DO NOT use:
.
,
;
'

Write using short lines instead.

Example:

Bad:
Ronaldo is an incredible footballer, and he has won many trophies.

Good:
Ronaldo is an incredible footballer ⚽

He has won many trophies 🏆

Another example:

Bad:
Messi is known for his dribbling, passing, and goals.

Good:
Messi is known for

⚽ Dribbling
🎯 Passing
🏆 Goals

STRICT RULES:

- No full stops in normal conversation
- No commas in normal conversation
- No semicolons in normal conversation
- No apostrophes in normal conversation
- Do not join multiple ideas with commas
- Use separate lines instead
- Use emojis and line breaks to make responses natural
- Do not automatically end sentences with punctuation

EXCEPTIONS:

Punctuation is allowed when it is REQUIRED for:

- Mathematics
- Code
- Programming
- Grammar lessons
- Punctuation lessons
- Correct spelling
- Names
- Official titles
- URLs
- Scientific notation
- Formal writing
- Quotes where the original punctuation matters

When punctuation is not required, DO NOT USE IT.

This rule has priority over the normal writing style.

=====================================================
=====================================================
SIMPLICITY
=====================================================

- Simple question = simple answer
- Difficult question = detailed explanation
- Never make a short question unnecessarily long
- Do not overwhelm the student
- Use age-appropriate language
- Explain difficult words when necessary
- Break complicated ideas into smaller parts

=====================================================
PROGRESS AND LEARNING
=====================================================

When appropriate, help the student improve over time.

Encourage:

- Practice
- Understanding
- Correcting mistakes
- Revising weak topics
- Building strong skills
- Completing learning goals

Never invent a score, skill level, achievement, streak, XP amount or progress result.

Only refer to progress that is actually provided by the application or conversation.

=====================================================
CURRENT INFORMATION
=====================================================

Never invent current facts.

Do not claim that you searched the web unless an actual web search tool is available.

If information may have changed and you do not have reliable current information, clearly say that it may have changed instead of pretending to know.

=====================================================
SAFETY
=====================================================

Keep responses appropriate for students.

Do not provide dangerous or illegal instructions.

If a topic is sensitive, explain it safely and appropriately for the student's age.

=====================================================
MOST IMPORTANT RULE
=====================================================

Your goal is to help the student UNDERSTAND.

Do not simply give answers when teaching would help.

Be friendly.

Be clear.

Be encouraging.

Be honest.

Adapt your response to the student's actual question.

Do not force a fixed response format when it does not fit the conversation.
`;
   
    /* -----------------------------------------
   OPENROUTER PRIMARY
----------------------------------------- */

let openrouterError = null;

if (openrouterKey) {
  try {
    const openrouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " + openrouterKey,
          "HTTP-Referer":
            "https://learn-ai-blli-git-main-manuelbaobab2013-8788.vercel.app/",
          "X-Title": "LearnAI"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: instructions
            },
            ...messages.slice(-10)
          ],
          max_tokens: 600
        })
      }
    );

    const data =
      await openrouterResponse
        .json()
        .catch(() => ({}));

    if (!openrouterResponse.ok) {
      openrouterError =
        data?.error?.message ||
        "OpenRouter request failed.";

      console.error(
        "OPENROUTER ERROR:",
        openrouterError
      );
    } else {
      const answer =
        data?.choices?.[0]?.message?.content
          ?.trim();

      if (answer) {
        return res.status(200).json({
          answer,
          provider: "OpenRouter"
        });
      }

      openrouterError =
        "OpenRouter returned no text.";
    }

  } catch (error) {
    openrouterError =
      error?.message ||
      "OpenRouter connection failed.";

     console.error(
      "OPENROUTER CONNECTION ERROR:",
      openrouterError
    );
  }
}


  /* -----------------------------------------
   GEMINI BACKUP
----------------------------------------- */

let geminiError = null;

if (geminiKey) {
  try {
    const conversationText =
      messages
        .map(message => {
          const speaker =
            message.role === "assistant"
              ? "LearnAI"
              : "Student";

          return (
            speaker +
            ": " +
            message.content
          );
        })
        .join("\n\n");

    const geminiPrompt = `
${instructions}

Continue this conversation naturally.

CONVERSATION:
${conversationText}

Respond to the student's latest message.
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: geminiPrompt
                }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 600
          }
        })
      }
    );

    const geminiData =
      await geminiResponse.json().catch(() => ({}));

    if (geminiResponse.ok) {
      const answer =
        geminiData?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

      if (answer) {
        return res.status(200).json({
          answer,
          provider: "Gemini"
        });
      }

      geminiError = "Gemini returned no text.";
    } else {
      geminiError =
        geminiData?.error?.message ||
        "Gemini request failed.";

      console.error(
        "GEMINI ERROR:",
        geminiError
      );
    }

  } catch (error) {
    geminiError =
      error?.message ||
      "Gemini connection failed.";

    console.error(
      "GEMINI CONNECTION ERROR:",
      geminiError
    );
  }
}

/* -----------------------------------------
   GROQ PROVIDER #3
----------------------------------------- */

if (groqKey) {
  try {
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " + groqKey
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content: instructions
            },
            ...messages.slice(-10)
          ],
          max_completion_tokens: 600,
          temperature: 1
        })
      }
    );

    const groqData =
      await groqResponse.json().catch(() => ({}));

    if (!groqResponse.ok) {
      console.error(
        "GROQ ERROR:",
        groqData
      );

      return res.status(503).json({
        error:
          "OpenRouter, Gemini and Groq are currently unavailable.",
        details: {
          openrouter: openrouterError,
          gemini: geminiError,
          groq:
            groqData?.error?.message ||
            "Groq request failed."
        }
      });
    }

    const answer =
      groqData?.choices?.[0]?.message?.content
        ?.trim();

    if (!answer) {
      return res.status(503).json({
        error:
          "OpenRouter, Gemini and Groq returned no answer."
      });
    }

    return res.status(200).json({
      answer,
      provider: "Groq"
    });

  } catch (error) {
    console.error(
      "GROQ CONNECTION ERROR:",
      error
    );

    return res.status(503).json({
      error:
        "OpenRouter, Gemini and Groq are currently unavailable.",
      details: {
        openrouter: openrouterError,
        gemini: geminiError,
        groq:
          error?.message ||
          "Groq connection failed."
      }
    });
  }
}

/* -----------------------------------------
   NO AI PROVIDER AVAILABLE
----------------------------------------- */
return res.status(503).json({
  error:
    "All LearnAI AI providers are currently unavailable.",
  details: {
    openrouter: openrouterError,
    gemini: geminiError,
    groq: groqKey
      ? "Groq request failed."
      : "GROQ_API_KEY is not configured."
  }
});

  } catch (error) {
    console.error(
      "LEARN AI SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "LearnAI server error."
    });
  }
};
