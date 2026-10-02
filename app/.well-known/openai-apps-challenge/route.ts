export const dynamic = "force-dynamic";

export async function GET() {
  const challenge = process.env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();
  if (!challenge) {
    return new Response("OpenAI app domain verification is not configured.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
