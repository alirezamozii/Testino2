import sharp from "sharp";

const svg = `<svg
  width="400"
  height="400"
  viewBox="0 0 200 200"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- Background Warm Aura -->
  <ellipse cx="98" cy="106" rx="86" ry="78" fill="#FFF4CC" opacity="0.8" />

  <!-- Left Cute Arm (rested/perked on side) -->
  <path
    d="M34 104C24 109 20 120 27 126C33 130 40 125 43 118"
    fill="#FFAEC9"
    stroke="#0F172A"
    strokeWidth="4.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  />

  <!-- Main Brain Body -->
  <path
    d="M48 52C36 52 25 63 25 77C25 91 34 102 43 108C39 119 45 131 60 137C75 143 89 137 99 126C109 137 123 143 138 137C153 131 159 119 155 108C164 102 173 91 173 77C173 63 162 52 150 52C140 40 120 37 106 47C96 37 76 37 66 47C56 40 47 42 48 52Z"
    fill="#FFAEC9"
    stroke="#0F172A"
    strokeWidth="5.5"
    strokeLinejoin="round"
  />

  <!-- Internal Brain Creases (Subtle folds) -->
  <path d="M60 72C53 81 56 90 64 92" stroke="#F472B6" strokeWidth="3.5" strokeLinecap="round" />
  <path d="M136 72C143 81 140 90 132 92" stroke="#F472B6" strokeWidth="3.5" strokeLinecap="round" />
  <path d="M99 50C99 60 103 66 103 66" stroke="#F472B6" strokeWidth="3.5" strokeLinecap="round" />

  <!-- Yellow Martial/Study Headband -->
  <path
    d="M29 74C65 67 125 67 167 74L165 89C125 81 65 81 27 89L29 74Z"
    fill="#FFE173"
    stroke="#0F172A"
    strokeWidth="4.5"
    strokeLinejoin="round"
  />

  <!-- Headband Knot Tails (Cute ribbon tie on left side) -->
  <path
    d="M28 80C17 77 9 84 11 94C12 99 19 99 23 95"
    fill="#FFE173"
    stroke="#0F172A"
    strokeWidth="4"
    strokeLinejoin="round"
  />
  <path
    d="M29 86C19 90 13 100 17 110C19 114 26 112 28 105"
    fill="#FCD34D"
    stroke="#0F172A"
    strokeWidth="4"
    strokeLinejoin="round"
  />

  <!-- Symmetrical Kawaii Eyes -->
  <!-- Left Eye -->
  <ellipse cx="68" cy="100" rx="6.5" ry="8" fill="#0F172A" />
  <circle cx="66" cy="97" r="2.8" fill="#FFFFFF" />
  <circle cx="70.5" cy="102.5" r="1.3" fill="#FFFFFF" />

  <!-- Right Eye (Clean, unobstructed, fully symmetrical!) -->
  <ellipse cx="110" cy="100" rx="6.5" ry="8" fill="#0F172A" />
  <circle cx="108" cy="97" r="2.8" fill="#FFFFFF" />
  <circle cx="112.5" cy="102.5" r="1.3" fill="#FFFFFF" />

  <!-- Happy Smile -->
  <path
    d="M84 109C86.5 115 91.5 115 94 109"
    stroke="#0F172A"
    strokeWidth="4"
    strokeLinecap="round"
  />

  <!-- Rosy Blush Cheeks -->
  <ellipse cx="54" cy="107" rx="7.5" ry="4" fill="#FB7185" opacity="0.65" />
  <ellipse cx="124" cy="107" rx="7.5" ry="4" fill="#FB7185" opacity="0.65" />

  <!-- Pencil Beside Brain (Standing Proudly on the Right Side) -->
  <g transform="translate(166, 18) rotate(12)">
    <!-- Wooden Cone & Tip -->
    <polygon points="0,20 18,20 9,0" fill="#FED7AA" stroke="#0F172A" strokeWidth="4" strokeLinejoin="round" />
    <polygon points="6,7 12,7 9,0" fill="#0F172A" />

    <!-- Main Yellow Hexagonal Shaft -->
    <rect x="0" y="20" width="18" height="88" rx="3" fill="#FFE173" stroke="#0F172A" strokeWidth="4.5" />
    <line x1="6" y1="20" x2="6" y2="108" stroke="#F59E0B" strokeWidth="2.2" />
    <line x1="12" y1="20" x2="12" y2="108" stroke="#F59E0B" strokeWidth="2.2" />

    <!-- Silver Metal Ferrule -->
    <rect x="0" y="108" width="18" height="12" fill="#CBD5E1" stroke="#0F172A" strokeWidth="4" />
    <line x1="2" y1="114" x2="16" y2="114" stroke="#94A3B8" strokeWidth="1.5" />

    <!-- Pink Rubber Eraser -->
    <path
      d="M0 120C0 120 0 133 9 133C18 133 18 120 18 120H0Z"
      fill="#F472B6"
      stroke="#0F172A"
      strokeWidth="4"
      strokeLinejoin="round"
    />
  </g>

  <!-- Right Arm/Hand Reaching Out to Hold the Pencil from the Side -->
  <path
    d="M144 105C152 103 162 105 168 110"
    stroke="#0F172A"
    strokeWidth="5"
    strokeLinecap="round"
  />
  <!-- Cute puffy hand gripping pencil from the side -->
  <g transform="translate(156, 98)">
    <rect x="0" y="3" width="14" height="18" rx="7" fill="#FFAEC9" stroke="#0F172A" strokeWidth="4" />
    <line x1="4" y1="9" x2="10" y2="9" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
    <line x1="4" y1="14" x2="10" y2="14" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
  </g>
</svg>`;

const outputPath = "C:/Users/Mozart/.gemini/antigravity/brain/948f981c-d917-40b0-81b6-7cfc90dddb34/mascot_test_preview.png";

await sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath);

console.log("Updated mascot rendered to:", outputPath);
