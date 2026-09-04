export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, subject, level } = req.body || {};

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing in Vercel"
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
        instructions: `You are the LearnAI AI Tutor.

Be friendly, patient, safe, and educational.
Explain answers step by step.
Match the student's learning level.
Do not simply give an answer when teaching would be better.

Subject: ${subject || "General"}
Student level: ${level || "Beginner"}`,
        input: question
      })
    });

    const data = await response.json();

    console.log("OPENAI RESPONSE:", JSON.stringify(data));

    if (!response.ok) {
      console.error("OPENAI ERROR:", data);

      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed"
      });
    }

    let answer = data?.output_text;

    if (!answer && Array.isArray(data?.output)) {
      answer = data.output
        .flatMap(item => Array.isArray(item.content) ? item.content : [])
        .filter(item => item.type === "output_text")
        .map(item => item.text || "")
        .join("");
    }

    if (!answer) {
      return res.status(500).json({
        error: "OpenAI returned no answer"
      });
    }

    return res.status(200).json({
      answer: answer
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
