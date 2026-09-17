const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const openrouterKey = process.env.OPENROUTER_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const instructions = `
You are LearnAI, a friendly AI tutor.

Help students understand their school subjects clearly.
Explain things step by step when needed.
Use language appropriate for the student's level.
Be encouraging and educational.
Do not make up facts.
Keep answers reasonably concise unless the student asks for more detail.
`;

app.get("/", (req, res) => {
  res.json({
    status: "LearnAI Tutor backup is running"
  });
});

app.post("/api/ai", async (req, res) => {
  const {
    question,
    subject = "General",
    level = "Intermediate",
    language = "English",
    history = []
  } = req.body || {};

  if (!question) {
    return res.status(400).json({
      error: "Question is required."
    });
  }

  let openrouterError = null;

  // ==============================
  // OPENROUTER PRIMARY
  // ==============================

  if (openrouterKey) {
    try {
      const messages = [
        {
          role: "system",
          content:
            instructions +
            `\nSubject: ${subject}` +
            `\nStudent level: ${level}` +
            `\nLanguage: ${language}`
        },
        ...history.slice(-10),
        {
          role: "user",
          content: question
        }
      ];

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterKey}`,
            "HTTP-Referer":
              "https://learn-ai-blli-git-main-manuelbaobab2013-8788.vercel.app/",
            "X-Title": "LearnAI"
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages,
            max_tokens: 600
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
          `OpenRouter returned ${response.status}`
        );
      }

      const answer =
        data?.choices?.[0]?.message?.content;

      if (!answer) {
        throw new Error("OpenRouter returned no answer.");
      }

      return res.json({
        answer,
        provider: "OpenRouter"
      });

    } catch (error) {
      openrouterError =
        error?.message ||
        "OpenRouter request failed.";
    }
  }

  // ==============================
  // GEMINI BACKUP
  // ==============================

  if (geminiKey) {
    try {
      const prompt = `
${instructions}

Subject: ${subject}
Student level: ${level}
Language: ${language}

Previous conversation:
${JSON.stringify(history.slice(-10))}

Student question:
${question}
`;

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" +
          encodeURIComponent(geminiKey),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
          `Gemini returned ${response.status}`
        );
      }

      const answer =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!answer) {
        throw new Error("Gemini returned no answer.");
      }

      return res.json({
        answer,
        provider: "Gemini"
      });

    } catch (error) {
      return res.status(503).json({
        error:
          "Both AI providers are currently unavailable.",
        details: {
          openrouter: openrouterError,
          gemini:
            error?.message ||
            "Gemini request failed."
        }
      });
    }
  }

  return res.status(503).json({
    error:
      "No AI provider is configured.",
    details: {
      openrouter: openrouterError
    }
  });
});

app.listen(PORT, () => {
  console.log(
    `LearnAI Tutor backup running on port ${PORT}`
  );
});
