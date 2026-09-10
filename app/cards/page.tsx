import type { Metadata } from "next";
import { CardsScreen } from "@/components/cards/CardsScreen";

export const metadata: Metadata = {
  title: "Membership cards · Giggly Gadget",
  description: "Loyalty codes for the till.",
};

// Everything lives on the phone (built-in catalogue + localStorage + IndexedDB),
// so this renders with no network — which is the point in a supermarket basement.
export default function CardsPage() {
  return <CardsScreen />;
}
