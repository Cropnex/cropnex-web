import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CropNex Farm Management",
    short_name: "CropNex",
    description:
      "Farm management, operations, scouting, financials and analytics.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#111516",
    theme_color: "#111516",
    orientation: "portrait-primary",
    categories: ["business", "productivity", "utilities"],
    icons: [{
      src: "/icons/cropnex.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    }],
  };
}

