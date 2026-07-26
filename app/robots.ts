// app/robots.ts
// Os links de cliente (/r/ e /c/) são privados por token. Buscador não deve
// indexá-los — e, mais importante, crawler não deve ficar abrindo esses
// endereços, porque cada abertura pode custar consulta às APIs de anúncio.

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
