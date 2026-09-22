import type { ContentBlock } from "@/features/questions/domain/question-schema";

export interface QuestionPassageTarget {
  targets: string[];
  paragraphNumber?: number; // 1-based (e.g. 1 for paragraph 1)
}

/**
 * Extracts target words or phrases and the referenced paragraph number (if any)
 * from the question statement.
 */
export function extractQuestionPassageTarget(questionContent: ContentBlock[] | string): QuestionPassageTarget {
  let text = "";
  if (typeof questionContent === "string") {
    text = questionContent;
  } else if (Array.isArray(questionContent)) {
    text = questionContent
      .filter((b) => b.type === "text" && typeof b.value === "string")
      .map((b) => (b as Extract<ContentBlock, { type: "text" }>).value)
      .join(" ");
  }

  if (!text) return { targets: [] };

  const targets = new Set<string>();

  // Pattern 1: English "The underlined word/words/phrase/term [“"']...["”']"
  const p1 = /(?:the\s+)?underlined\s+(?:word|words|phrase|term)s?\s*["“'«]([^"”'»]+)["”'»]/gi;
  for (const m of text.matchAll(p1)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Pattern 2: English "[“"']...["”'] in paragraph/line ..."
  const p2 = /(?:the\s+)?(?:word|phrase|term)s?\s*["“'«]([^"”'»]+)["”'»]\s*(?:in|from)\s*(?:paragraph|line|passage)/gi;
  for (const m of text.matchAll(p2)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Pattern 3: English "in paragraph X, the (underlined) word [“"']...["”']"
  const p3 = /in\s+paragraph\s+\d+[\s\S]*?(?:word|phrase)\s*["“'«]([^"”'»]+)["”'»]/gi;
  for (const m of text.matchAll(p3)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Pattern 4: English "word/phrase [“"']...["”'] is closest in meaning / refers to / means"
  const p4 = /(?:word|phrase|term)\s*["“'«]([^"”'»]+)["”'»]\s*(?:is\s+closest\s+in\s+meaning|means?|refers?\s+to)/gi;
  for (const m of text.matchAll(p4)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Pattern 5: English unquoted "the underlined word/term [word]" (3+ letters)
  const p5 = /(?:the\s+)?underlined\s+(?:word|term)\s+([a-zA-Z]{2,})\b/gi;
  for (const m of text.matchAll(p5)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Pattern 6: Persian "زیر واژه/کلمه/عبارت «...» خط کشیده شده"
  const p6 = /(?:زیر\s+)?(?:واژه|کلمه|عبارت)\s*(?:مشخص‌شده|خط‌کشیده‌شده)?\s*[«"']([^»"']+)["»']/g;
  for (const m of text.matchAll(p6)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Pattern 7: Persian "منظور / مفهوم از واژه «...» در متن / پاراگراف"
  const p7 = /(?:منظور|مفهوم)\s+(?:از\s+)?(?:واژه|کلمه|عبارت)?\s*[«"']([^»"']+)["»']\s*(?:در\s*(?:متن|پاراگراف|بند))/g;
  for (const m of text.matchAll(p7)) {
    if (m[1]?.trim()) targets.add(m[1].trim());
  }

  // Filter out noise
  const stopwords = new Set(["the", "this", "that", "which", "what", "where", "when", "who"]);
  const validTargets = Array.from(targets).filter((t) => {
    const clean = t.trim();
    if (clean.length < 2) return false;
    if (/^\d+$/.test(clean)) return false;
    if (stopwords.has(clean.toLowerCase())) return false;
    return true;
  });

  // Extract Paragraph Reference (e.g. "in paragraph 1", "in the second paragraph", "در پاراگراف دوم")
  let paragraphNumber: number | undefined;

  const numMatch = text.match(/\bparagraph\s+(\d+)\b/i);
  if (numMatch) {
    paragraphNumber = parseInt(numMatch[1], 10);
  } else {
    const ordinals: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
    };
    const ordMatch = text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five)\s+paragraph\b/i);
    if (ordMatch) {
      paragraphNumber = ordinals[ordMatch[1].toLowerCase()];
    } else {
      const faNumMatch = text.match(/(?:پاراگراف|بند)\s*(?:شماره\s*)?([0-9\u06F0-\u06F9]+)/);
      if (faNumMatch) {
        const ascii = faNumMatch[1].replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 1776));
        paragraphNumber = parseInt(ascii, 10);
      } else {
        const faOrdinals: Record<string, number> = {
          "اول": 1,
          "نخست": 1,
          "دوم": 2,
          "سوم": 3,
          "چهارم": 4,
          "پنجم": 5,
          "ششم": 6,
          "هفتم": 7,
          "هشتم": 8,
          "نهم": 9,
          "دهم": 10,
        };
        const faOrdMatch = text.match(/(?:پاراگراف|بند)\s*(اول|نخست|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم)/);
        if (faOrdMatch) {
          paragraphNumber = faOrdinals[faOrdMatch[1]];
        }
      }
    }
  }

  return {
    targets: validTargets,
    paragraphNumber,
  };
}

/**
 * Backward-compatible helper for extracting targets.
 */
export function extractTargetUnderlineWords(questionContent: ContentBlock[] | string): string[] {
  return extractQuestionPassageTarget(questionContent).targets;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Automatically highlights/underlines target words in passage blocks,
 * strictly respecting paragraph boundaries when a paragraph number is specified.
 * Also prepends clean paragraph badges (¶ 1, ¶ 2, ...) to clearly distinguish paragraphs.
 */
export function highlightPassageTargets(
  passageBlocks: ContentBlock[] | undefined | null,
  targets: string[],
  targetParagraph?: number
): ContentBlock[] {
  if (!passageBlocks || !passageBlocks.length) {
    return passageBlocks ? [...passageBlocks] : [];
  }

  const hasTargets = targets && targets.length > 0;
  const targetLowerSet = new Set(targets.map((t) => t.toLowerCase()));

  // Count total paragraphs across all text blocks
  let globalParaIndex = 0;

  return passageBlocks.map((block) => {
    if (block.type !== "text" || typeof block.value !== "string") {
      return block;
    }

    // Split block into individual paragraphs by double newlines or single newlines
    const rawParas = block.value.split(/\n\s*\n/);

    const processedParas = rawParas.map((paraText) => {
      globalParaIndex++;
      const currentParaNum = globalParaIndex;
      const isTargetPara = targetParagraph === undefined || targetParagraph === currentParaNum;

      let modified = paraText;

      // 1. Strip stale <u> tags that belong to OTHER questions (e.g. "motivation" when on "his")
      if (hasTargets) {
        modified = modified.replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, (match, inner) => {
          const cleanInner = inner.replace(/<[^>]+>/g, "").trim().toLowerCase();
          if (!targetLowerSet.has(cleanInner)) {
            // Belongs to another question; strip the <u> tag
            return inner;
          }
          return match;
        });
      }

      // 2. Only apply highlights if this is the target paragraph
      if (hasTargets && isTargetPara) {
        for (const target of targets) {
          if (!target) continue;

          const escaped = escapeRegex(target);
          const isAscii = /^[a-zA-Z0-9\s_-]+$/.test(target);
          const pattern = isAscii
            ? new RegExp(`\\b(${escaped})\\b`, "gi")
            : new RegExp(`(?<![0-9\\u06F0-\\u06F9a-zA-Z\\u0600-\\u06FF])(${escaped})(?![0-9\\u06F0-\\u06F9a-zA-Z\\u0600-\\u06FF])`, "gu");

          modified = modified.replace(pattern, (match, p1, offset, fullText) => {

            // If already inside an active <u> or <ins> or <mark> tag, leave it
            const before = fullText.slice(0, offset);
            const openTagMatch = before.match(/<(u|ins|mark)\b[^>]*>(?![\s\S]*?<\/\1>)/i);
            if (openTagMatch) {
              return match;
            }

            // For pronouns, if there are multiple occurrences in this paragraph,
            // badge them so the student can distinguish (e.g. his #1, his #2)
            // or highlight the first one cleanly
            return `<u>${match}</u>`;
          });
        }
      }

      // Strip any paragraph badge if present
      modified = modified.replace(/<span\b[^>]*>¶\s*\d+<\/span>\s*/gi, "");

      return modified;
    });

    return {
      ...block,
      value: processedParas.join("\n\n"),
    };
  });
}
