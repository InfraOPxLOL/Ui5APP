# `sdk/rest/` — REST framework

A generic REST layer built directly on `sdk/http`'s `IHttpClient` (architecture: REST Framework,
§6). Adds what a plain REST call needs beyond raw transport: automatic JSON serialization/
deserialization, multipart submission, binary downloads, and translation of any non-2xx response
into the SDK's typed error taxonomy via `HttpErrorTranslator` — callers never parse a raw error body
or branch on a status code themselves.

## `SdkRestClient`

```ts
const client = new SdkRestClient(httpClient);

await client.get<MessageDto[]>(url, context);
await client.post<CreatedDto, PayloadDto>(url, body, context);
await client.postMultipart<UploadResultDto>(url, fields, context);
await client.getBinary(url, context); // → { data: Uint8Array, ... }
```

- **JSON** (default) — request/response bodies are serialized/deserialized automatically.
- **XML / text** (`contentType: "xml" | "text"`) — passed through as raw strings; the SDK does not
  attempt object↔XML mapping (out of scope for a reusable, dependency-light SDK — see
  `sdk/odata`'s `ODataMetadataParser` for the one XML-parsing capability the SDK does provide).
- **Binary** — `getBinary()` requests a buffered `Uint8Array` response (`binaryResponse: true` at
  the HTTP layer), correct for certificates/attachments where text decoding would corrupt bytes.
- **Multipart** — `postMultipart()` builds a `FormData` body from `MultipartField[]`.

Every method's error path funnels through `HttpErrorTranslator.translate(tenantId, errorResponse)`,
so a `SdkRestClient` caller always receives a typed `AppError`, never a raw status code.
