/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf.js tourne côté serveur (route /api/parse-pdf) : on ne le bundle pas
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/parse-pdf": ["./node_modules/pdfjs-dist/legacy/build/**/*.js", "./node_modules/pdfjs-dist/standard_fonts/**"],
  },
};
export default nextConfig;
