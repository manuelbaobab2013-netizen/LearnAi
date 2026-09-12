export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      question,
      subject,
      level,
      language
    } = req.body || {};

    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!openaiKey && !geminiKey) {
      return res.status(500).json({
        error: "No AI provider is connected."
      });
    }

    const instructions = `
You are LearnAI, a friendly AI tutor.

Help the student learn clearly and accurately.
Match the explanation to the student's level.
Explain step by step when useful.
Keep answers understandable and educational.
Do not make up facts.

Subject: ${subject || "General"}
Learning level: ${level || "School"}
Language: ${language || "English"}
`;

    let answer = null;
    let provider = null;

    // OPENAI
    if (openaiKey) {
      try {
        const response = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              instructions,
              input: question,
              max_output_tokens: 400
            })
          }
        );

        const data = await response.json();

        console.log("OpenAI status:", response.status);

        if (response.ok) {
          answer = data?.output_text || "";

          if (
            !answer &&
            Array.isArray(data?.output)
          ) {
            answer = data.output
              .flatMap(item =>
                Array.isArray(item.content)
                  ? item.content
                  : []
              )
              .filter(item =>
                item.type === "output_text"
              )
              .map(item =>
                item.text || ""
              )
              .join("");
          }

          if (answer) {
            provider = "OpenAI";
          }
        } else {
          console.error("OpenAI error:", data);
        }
      } catch (error) {
        console.error("OpenAI connection error:", error);
      }
    }

    // GEMINI BACKUP
    if (!answer && geminiKey) {
      try {
        const response = await fetch(
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
                  parts: [
                    {
                      text: `${instructions}

Student question:
${question}`
                    }
                  ]
                }
              ],
              generationConfig: {
                maxOutputTokens: 400
              }
            })
          }
        );

        const data = await response.json();

        console.log("Gemini status:", response.status);

        if (response.ok) {
          answer =
            data?.candidates?.[0]?.content?.parts
              ?.map(part => part.text || "")
              .join("") || "";

          if (answer) {
            provider = "Gemini";
          }
        } else {
          console.error("Gemini error:", data);
        }
      } catch (error) {
        console.error("Gemini connection error:", error);
      }
    }

    if (!answer) {
      return res.status(503).json({
        error: "The AI service is temporarily unavailable."
      });
    }

    return res.status(200).json({
      answer,
      provider
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: "AI backend error."
    });
  }
}
