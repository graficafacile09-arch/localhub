"use client";

import OfferteModule from "@/components/merchant/modules/OfferteModule";
import type { StepProps } from "../editor-steps";

export default function StepOfferte({ storeId }: StepProps) {
  return <OfferteModule storeId={storeId} />;
}
