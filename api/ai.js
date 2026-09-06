export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const question = String(body.question || "").trim();
    const level = String(body.level || "Beginner");
    const subject = String(body.subject || "General");
    const language = String(body.language || "English");
    const history = Array.isArray(body.history) ? body.history : [];

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const instructions = `
You are LearnAI, a friendly AI tutor.

Your job is to understand the student and answer naturally.

STUDENT:
Level: ${level}
Subject: ${subject}
Language: ${language}

HOW TO TALK:
- Understand spelling mistakes and messy grammar.
- Focus on what the student means.
- Talk naturally, not like a robot.
- Use normal punctuation.
- Do not randomly use semicolons, slashes, or repeated punctuation.
- Do not make every answer a huge list.
- Do not give unnecessarily long answers.
- For a simple question, give a simple answer.
- For a difficult question, explain it step by step.
- Match the student's level.
- Use words the student can understand.
- If the student says "just pick", choose one clearly.
- Do not ask unnecessary follow-up questions.
- Be friendly and confident.
- Do not repeat the student's question.

TEACHING:
- Beginner: simple words and clear examples.
- Intermediate: clear explanations with useful examples.
- Advanced: more precise explanations and terminology.

CURRENT INFORMATION:
Use web search when the question needs current or specific information.
This includes current news, sports, recent events, specific people, players, teams, records and other information that may have changed.
Never guess current information.

SUBJECTS:
You can help with mathematics, science, English, history, geography, chess, football, basketball, technology and general knowledge.

SAFETY:
Keep answers appropriate for students.
Do not help with dangerous or illegal activities.

Answer the student's latest question directly.
`;

    const messages = [];

    for (const item of history.slice(-20)) {
      if (!item || !item.content) continue;

      const role =
        item.role === "assistant" ? "assistant" : "user";

      messages.push({
        role,
        content: String(item.content)
      });
    }

    messages.push({
      role: "user",
      content: question
    });

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          instructions,
          input: messages,
          tools: [
            {
              type: "web_search"
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OPENAI ERROR:", data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          "OpenAI request failed"
      });
    }

    const answer = data.output_text;

    if (!answer) {
      console.error("NO OUTPUT:", data);

      return res.status(500).json({
        error: "The AI returned no answer."
      });
    }

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: "The AI server encountered an error."
    });
  }
}
