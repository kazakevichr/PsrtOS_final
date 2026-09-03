import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "OWNER" | "MANAGER" | "SMM" | "PARTNER";
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role: "OWNER" | "MANAGER" | "SMM" | "PARTNER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "OWNER" | "MANAGER" | "SMM" | "PARTNER";
  }
}
