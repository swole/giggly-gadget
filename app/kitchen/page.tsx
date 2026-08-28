import { redirect } from "next/navigation";

// Kitchen lives at "/". Keep this alias so the name in docs and links resolves.
export default function KitchenAlias() {
  redirect("/");
}
