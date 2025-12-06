import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const adminUsername = process.env.ADMIN_USERNAME;
                const adminPassword = process.env.ADMIN_PASSWORD;

                if (!adminUsername || !adminPassword) {
                    console.error("ADMIN_USERNAME or ADMIN_PASSWORD not configured in .env");
                    return null;
                }

                if (
                    credentials?.username === adminUsername &&
                    credentials?.password === adminPassword
                ) {
                    return {
                        id: "1",
                        name: "Admin",
                        email: "admin@simplens.local",
                    };
                }

                return null;
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnLogin = nextUrl.pathname === "/login";

            if (isOnLogin) {
                if (isLoggedIn) {
                    return Response.redirect(new URL("/", nextUrl));
                }
                return true;
            }

            if (!isLoggedIn) {
                return false;
            }

            return true;
        },
    },
});
