"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ROI por Cliente mudou para uma aba dentro de /clientes.
export default function VendasPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/clientes?view=roi"); }, [router]);
  return null;
}
