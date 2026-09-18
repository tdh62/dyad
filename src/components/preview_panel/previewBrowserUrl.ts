export async function resolvePreviewBrowserUrl(input: {
  originalUrl: string | null | undefined;
}): Promise<string> {
  if (!input.originalUrl) {
    throw new Error("Preview URL is unavailable.");
  }

  return input.originalUrl;
}
