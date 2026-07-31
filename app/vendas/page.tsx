"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ROI por Cliente mudou para uma aba dentro de /clientes.
export default function VendasPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/clientes#roi"); }, [router]);
  return null;
}
