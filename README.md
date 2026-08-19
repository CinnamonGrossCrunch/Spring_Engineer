This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Engineering nomenclature

To keep V1/V2 terminology consistent, UI labels and symbols should use the shared
canonical map in `lib/engineering/nomenclature.ts`.

- Use `canonicalName(id)` for human-readable parameter names.
- Use `canonicalSym(id)` for display symbols (including unicode subscripts).
- Do not duplicate ad-hoc label/symbol strings when a canonical mapping exists.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## CAD Generation

V2 candidates can be turned into nominal squared-and-ground spring **STEP**
geometry through the companion CAD service in [`cad-service/`](cad-service/),
built on build123d over the OpenCascade B-rep kernel.

Select a candidate in the V2 workspace, click **Generate CAD Model**, choose
which of the four mechanism states you want (Free, Armed / Compressed, Hammer
Contact, Latch Follow-Through), and download a STEP file, a ZIP of several
states, or a side-by-side STEP assembly.

- **True B-rep STEP**, exported directly from the kernel — no mesh, no STL, and
  no hand-written STEP text anywhere in the pipeline.
- **Four mechanism configurations** of the same nominal spring. Only the active
  pitch differs; each state reaches its requested length geometrically, never
  by scaling the finished solid.
- **Real ground bearing faces.** The ends are trimmed by planar Boolean cuts,
  so the flat seating surfaces exist in the exported solid.
- **Not a deformation simulation.** The states are geometric configuration
  representations, not FEA solutions.
- **Not vendor validated.** End-form and grinding details are CAD
  representation heuristics; confirm them with your spring vendor.

The engineering model stays the source of truth. The CAD service receives
already-derived candidate values and contains no spring physics — it never
recomputes rate, stress, force or work, and it never reads the SVG renderer.

### Running it locally

```bash
# Terminal 1 - CAD service
cd cad-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Next.js
CAD_SERVICE_URL=http://localhost:8000 npm run dev
```

Copy `.env.example` to `.env.local` to set `CAD_SERVICE_URL` persistently. The
browser only ever calls the local `/api/cad/*` proxy routes, so the CAD
service's deployed location is never baked into the bundle.

See [`cad-service/README.md`](cad-service/README.md) for the geometry model,
the requirements-versus-heuristics breakdown, and the validation strategy.
