export async function TempIndexRead(request, env) {
  const bucket = env.R2; // use R2 instead of BUCKET
  if (!bucket) {
    return new Response("R2 bucket binding missing", { status: 500 });
  }

  try {
    const fileObj = await bucket.get("index-page.html");

    if (!fileObj) {
      return new Response("index-page.html not found", { status: 404 });
    }

    const htmlContent = await fileObj.text();

    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html; charset=UTF-8" }
    });
  } catch (err) {
    console.error("TempIndexRead error:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
