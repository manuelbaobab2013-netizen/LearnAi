export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { question, subject, level, language } = req.body || {};

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    // Get the secret from Vercel Environment Variables
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OPENAI_API_KEY is not available.");
      return res.status(500).json({
        error: "OpenAI API key is not connected to this Vercel deployment."
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",

        instructions: `You are LearnAI, an AI tutor.

Be friendly, patient, safe, and educational.

Explain things clearly and step by step.
Match the student's learning level.
Use simple explanations when appropriate.
Do not make up facts.
If the student asks for school work, help them understand it.

Subject: ${subject || "General"}
Learning level: ${level || "Beginner"}
Language: ${language || "English"}`,

        input: question
      })
    });

    const data = await response.json();

    console.log("OpenAI status:", response.status);

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI request failed."
      });
    }

    let answer = data?.output_text;

    if (!answer && Array.isArray(data?.output)) {
      answer = data.output
        .flatMap(item =>
          Array.isArray(item.content)
            ? item.content
            : []
        )
        .filter(item => item.type === "output_text")
        .map(item => item.text || "")
        .join("");
    }

    if (!answer) {
      return res.status(500).json({
        error: "OpenAI returned no answer."
      });
    }

    return res.status(200).json({
      answer
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
}
