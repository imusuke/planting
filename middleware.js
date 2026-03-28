import { next } from "@vercel/functions";

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Planting"',
      "Cache-Control": "no-store",
    },
  });
}

function misconfigured() {
  return new Response("Basic auth is not configured correctly.", {
    status: 500,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export default function middleware(request) {
  const user = process.env.SITE_BASIC_AUTH_USER || "";
  const password = process.env.SITE_BASIC_AUTH_PASSWORD || "";

  if (!user && !password) {
    return next();
  }

  if (!user || !password) {
    return misconfigured();
  }

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded = "";
  try {
    decoded = atob(authHeader.slice(6));
  } catch (error) {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  const inputUser = separator >= 0 ? decoded.slice(0, separator) : decoded;
  const inputPassword = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (inputUser !== user || inputPassword !== password) {
    return unauthorized();
  }

  return next();
}

export const config = {
  matcher: ["/((?!_next/|_vercel/).*)"],
};