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

    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({
        error: "SUPABASE_URL is missing in Vercel."
      });
    }

    if (!supabaseServiceKey) {
      return res.status(500).json({
        error: "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel."
      });
    }

    if (!supabaseAnonKey) {
      return res.status(500).json({
        error:
          "SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is missing in Vercel."
      });
    }

    if (!openaiKey && !geminiKey) {
      return res.status(500).json({
        error:
          "No AI provider is configured. Add OPENAI_API_KEY or GEMINI_API_KEY in Vercel."
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
You are LearnAI, a professional AI tutor.

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

PERSONALITY:
- Be friendly and natural.
- Understand spelling mistakes.
- Understand short messages and slang.
- Focus on what the student means.
- Answer directly.
- Do not ask unnecessary questions.
- Do not repeat the student's question.
- If the student asks you to choose one thing, choose one clearly.

TEACHING:
1. Explain the idea.
2. Explain why it works.
3. Give an example.
4. Give steps when useful.
5. Give practice questions when requested.

MATHEMATICS:
- Show important steps.
- Explain the method.
- Give the final answer clearly.

SCIENCE:
- Explain what happens.
- Explain why it happens.
- Give everyday examples when useful.

ENGLISH:
- Explain grammar and vocabulary clearly.
- Give examples.

CHESS:
- Explain tactics, strategy and ideas clearly.
- Never pretend to see a position that was not provided.

CURRENT INFORMATION:
- Use web search when current information is needed.
- Never invent facts.

STYLE:
- Keep simple answers short.
- Give more detail when necessary.
- Use normal punctuation.
- Do not overuse emojis.
- Do not make every answer a huge list.

SAFETY:
- Keep responses appropriate for students.
- Do not provide dangerous or illegal instructions.

IMPORTANT:
Your goal is to help the student understand, not just give an answer.
Never pretend to know something when you are unsure.
`;

    /* -----------------------------------------
       OPENAI PRIMARY
    ----------------------------------------- */

    let openaiError = null;

    if (openaiKey) {
      try {
        const openaiResponse = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + openaiKey
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              instructions: instructions,
              input: messages.slice(-10),
              max_output_tokens: 600
            })
          }
        );

        const data =
          await openaiResponse.json().catch(() => ({}));

        if (!openaiResponse.ok) {
          openaiError =
            data?.error?.message ||
            "OpenAI request failed.";

          console.error(
            "OPENAI ERROR:",
            openaiError
          );
        } else {
          let answer =
            data.output_text;

          if (
            !answer &&
            Array.isArray(data.output)
          ) {
            answer =
              data.output
                .filter(
                  item =>
                    item.type === "message"
                )
                .flatMap(
                  item =>
                    item.content || []
                )
                .filter(
                  item =>
                    item.type === "output_text"
                )
                .map(
                  item =>
                    item.text
                )
                .filter(Boolean)
                .join("\n");
          }

          if (answer) {
            return res.status(200).json({
              answer: answer.trim(),
              provider: "OpenAI"
            });
          }

          openaiError =
            "OpenAI returned no text.";
        }
      } catch (error) {
        openaiError =
          error?.message ||
          "OpenAI connection failed.";

        console.error(
          "OPENAI CONNECTION ERROR:",
          openaiError
        );
      }
    }

    /* -----------------------------------------
       GEMINI BACKUP
    ----------------------------------------- */

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

        if (!geminiResponse.ok) {
          console.error(
            "GEMINI ERROR:",
            geminiData
          );

          return res.status(503).json({
            error:
              "OpenAI and Gemini are currently unavailable.",
            details: {
              openai: openaiError,
              gemini:
                geminiData?.error?.message ||
                "Gemini request failed."
            }
          });
        }

        const answer =
          geminiData?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
          return res.status(503).json({
            error:
              "Both AI providers returned no answer."
          });
        }

        return res.status(200).json({
          answer,
          provider: "Gemini"
        });

      } catch (error) {
        console.error(
          "GEMINI CONNECTION ERROR:",
          error
        );

        return res.status(503).json({
          error:
            "OpenAI and Gemini are currently unavailable.",
          details: {
            openai: openaiError,
            gemini:
              error?.message ||
              "Gemini connection failed."
          }
        });
      }
    }

    /* -----------------------------------------
       NO BACKUP AVAILABLE
    ----------------------------------------- */

    return res.status(503).json({
      error:
        "OpenAI is currently unavailable and no Gemini backup is configured.",
      details: openaiError
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
