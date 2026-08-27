import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Language Study",
    short_name: "词汇复习",
    description:
      "Local-first language vocabulary study with FSRS scheduling and offline review.",
    id: "/study",
    start_url: "/study",
    scope: "/",
    lang: "zh-CN",
    display: "standalone",
    display_override: ["standalone", "fullscreen"],
    background_color: "#07111d",
    theme_color: "#07111d",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
