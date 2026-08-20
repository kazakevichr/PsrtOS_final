import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "OWNER" | "MANAGER" | "SMM";
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role: "OWNER" | "MANAGER" | "SMM";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "OWNER" | "MANAGER" | "SMM";
  }
}
