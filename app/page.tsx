import { redirect } from "next/navigation";

// The stage 00 token page is gone. Middleware decides where the user lands.
export default function RootPage() {
  redirect("/dashboard");
}
