import type { JsonLdObject } from "./structured-data";
import { toJsonLd } from "./structured-data";

/**
 * Renders a schema.org JSON-LD `<script>` element.
 *
 * Rendered inside the page once its query data has loaded (client-fetch
 * convention), so it never participates in hydration and never duplicates.
 * The payload is serialized with `toJsonLd` (JSON.stringify + "<" escaping)
 * so user/API content cannot break out of the script element — this is the
 * safe-serialization requirement; no raw string concatenation occurs.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(data) }} />;
}
