import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";

function getClientBaseUrl(request: NextRequest): string {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const hostHeader = request.headers.get("host");
    let host = forwardedHost || hostHeader || request.nextUrl.host || "localhost:3002";
    if (host.includes("0.0.0.0")) {
        host = host.replace("0.0.0.0", "localhost");
    }

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const proto = forwardedProto || (request.url.startsWith("https") ? "https" : "http");

    return `${proto}://${host}`;
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const token = request.cookies.get("simplens_session")?.value;
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "";

    const headers = new Headers();
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const backendUrl = `${API_BASE_URL}/api/file/${id}/download`;

    try {
        const backendRes = await fetch(backendUrl, {
            headers,
        });

        if (!backendRes.ok) {
            let errorMsg = "The requested file attachment could not be located in storage.";
            try {
                const errorJson = await backendRes.json();
                if (errorJson?.error) {
                    errorMsg = errorJson.error;
                } else if (errorJson?.message) {
                    errorMsg = errorJson.message;
                }
            } catch {
                // If response is not JSON
            }

            const clientBase = getClientBaseUrl(request);
            const basePath = process.env.BASE_PATH || "";
            const notFoundUrl = new URL(`${basePath}/file-not-found`, clientBase);
            notFoundUrl.searchParams.set("error", errorMsg);

            return NextResponse.redirect(notFoundUrl, 307);
        }

        const responseHeaders = new Headers();
        const contentType = backendRes.headers.get("content-type") || "application/octet-stream";
        const contentDisposition = backendRes.headers.get("content-disposition");
        const contentLength = backendRes.headers.get("content-length");

        responseHeaders.set("Content-Type", contentType);
        if (contentDisposition) {
            responseHeaders.set("Content-Disposition", contentDisposition);
        } else if (filename) {
            responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`);
        } else {
            responseHeaders.set("Content-Disposition", `attachment; filename="${id}"`);
        }

        if (contentLength) {
            responseHeaders.set("Content-Length", contentLength);
        }

        return new NextResponse(backendRes.body, {
            status: 200,
            headers: responseHeaders,
        });
    } catch (err) {
        const clientBase = getClientBaseUrl(request);
        const basePath = process.env.BASE_PATH || "";
        const notFoundUrl = new URL(`${basePath}/file-not-found`, clientBase);
        notFoundUrl.searchParams.set("fileId", id);
        if (filename) notFoundUrl.searchParams.set("filename", filename);
        notFoundUrl.searchParams.set(
            "error",
            err instanceof Error ? err.message : "Failed to connect to storage service"
        );

        return NextResponse.redirect(notFoundUrl, 307);
    }
}
