export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, subject, level } = req.body || {};

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing in Vercel"
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions: `You are the LearnAI AI Tutor.
Be friendly, patient and educational.
Explain things step by step.
Match the student's learning level.
Subject: ${subject || "General"}
Student level: ${level || "Beginner"}`,
        input: question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return res.status(response.status).json({
        error: data.error?.message || "OpenAI request failed"
      });
    }

    let answer = data.output_text;

if (!answer && data.output) {
  answer = data.output
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("");
}

if (!answer) {
  console.error("NO ANSWER FROM OPENAI:", JSON.stringify(data));

  return res.status(500).json({
    error: "OpenAI returned no answer. Check Vercel logs."
  });
}

return res.status(200).json({
  answer: answer
});
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
