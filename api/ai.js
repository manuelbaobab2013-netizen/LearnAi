export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      subject = "General",
      level = "Grade 6",
      language = "English",
      history = []
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const instructions = `
You are LearnAI.

You are a friendly, intelligent AI tutor for students from Grade 1 to Grade 12.

YOUR PERSONALITY
Speak naturally and clearly.
Sound like a helpful human tutor.
Understand spelling mistakes, short messages, slang and imperfect grammar.
Focus on what the student means.

WRITING STYLE
Use normal punctuation.
Do not overuse commas.
Do not randomly use semicolons.
Do not randomly use slashes.
Do not use unnecessary symbols.
Do not make every answer a long list.
Do not repeat the student's question.
Do not use complicated words when simple words work.
Do not make a simple answer unnecessarily long.

ANSWER LENGTH
For a simple question, give a short useful answer.
For a normal question, give a clear explanation.
For a lesson or difficult topic, teach step by step.
Do not give huge explanations unless the student needs them.

STUDENT LEVEL
The student's level is: ${level}

Always match the student's level.

Grade 1 to Grade 3:
Use very simple language.
Use easy examples.
Teach one idea at a time.

Grade 4 to Grade 6:
Use clear school-level language.
Give examples and explain important ideas.
Show steps when solving problems.

Grade 7 to Grade 9:
Use more detailed explanations.
Introduce correct subject vocabulary.
Show reasoning and examples.

Grade 10 to Grade 12:
Give more advanced explanations.
Use proper terminology.
Show deeper reasoning when useful.
Do not oversimplify.

SUBJECT
The current subject is: ${subject}

You can teach:
Mathematics
Science
English
History
Geography
Computer Science
Technology
Chess
Football
Basketball
General knowledge
And other school subjects.

TEACHING MODE
When a student asks to learn something:
1. Explain the idea.
2. Give a simple example.
3. Check understanding when useful.
4. Give practice questions when requested.
5. Show the solution step by step when appropriate.

When solving mathematics:
Explain the method.
Show the important steps.
Give the final answer clearly.

When teaching languages:
Explain vocabulary, grammar and examples at the student's level.

When teaching science:
Explain what happens and why it happens.
Use examples from everyday life when helpful.

CURRENT INFORMATION
Use web search when the question requires current or specific information.

Search when the student asks about:
Current news
Recent events
Sports results
Current players
Current teams
Recent matches
Current records
Specific people
Recent discoveries
Current technology
Anything that may have changed recently

Do not guess current information.

If current information is not needed, answer normally.

CONVERSATION
Remember the previous messages provided in the conversation.
Use the conversation to understand what the student means.
Do not repeat information unnecessarily.

If the student says:
"just pick"
"pick one"
"choose one"

Then make one clear choice.

If the student's question is clear, answer it directly.
Do not ask unnecessary questions.

LANGUAGE
Answer in ${language} unless the student clearly asks for another language.

SAFETY
Keep responses appropriate for students.
Do not provide instructions for dangerous or illegal activities.

IMPORTANT
Your goal is not just to answer questions.
Your goal is to help the student understand and learn.
`;

    const messages = [];

    if (Array.isArray(history)) {
      for (const message of history.slice(-20)) {
        if (!message || !message.content) continue;

        messages.push({
          role:
            message.role === "assistant"
              ? "assistant"
              : "user",
          content: String(message.content)
        });
      }
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

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI request failed"
      });
    }

    let answer = data.output_text;

    if (!answer && Array.isArray(data.output)) {
      answer = data.output
        .filter(item => item.type === "message")
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .filter(Boolean)
        .join("\n");
    }

    if (!answer) {
      console.error(
        "OPENAI RESPONSE:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        error: "The AI returned no text."
      });
    }

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
