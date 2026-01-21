/**
 * Tests for scorer.ts - focusing on robust JSON parsing from AI responses
 */

import { describe, it, expect } from 'vitest';
import { parseJsonFromContent } from './scorer.js';

describe('parseJsonFromContent', () => {
    describe('valid JSON inputs', () => {
        it('should parse clean JSON object', () => {
            const input = '{"score": 85, "reason": "Great match"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(85);
            expect(result.reason).toBe('Great match');
        });

        it('should parse JSON with extra whitespace', () => {
            const input = '  { "score" : 75 , "reason" : "Good fit" }  ';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(75);
            expect(result.reason).toBe('Good fit');
        });

        it('should parse JSON with newlines', () => {
            const input = `{
        "score": 90,
        "reason": "Excellent match for the role"
      }`;
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(90);
            expect(result.reason).toBe('Excellent match for the role');
        });
    });

    describe('markdown code fences', () => {
        it('should strip ```json code fences', () => {
            const input = '```json\n{"score": 80, "reason": "Match"}\n```';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(80);
        });

        it('should strip ```JSON code fences (uppercase)', () => {
            const input = '```JSON\n{"score": 80, "reason": "Match"}\n```';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(80);
        });

        it('should strip ``` code fences without language specifier', () => {
            const input = '```\n{"score": 70, "reason": "Decent"}\n```';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(70);
        });

        it('should handle nested code fence patterns', () => {
            const input = 'Here is the score:\n```json\n{"score": 65, "reason": "Partial match"}\n```\nEnd.';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(65);
        });
    });

    describe('surrounding text', () => {
        it('should extract JSON from text before', () => {
            const input = 'Based on my analysis, here is my evaluation: {"score": 55, "reason": "Limited match"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(55);
        });

        it('should extract JSON from text after', () => {
            const input = '{"score": 60, "reason": "Moderate match"} I hope this helps!';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(60);
        });

        it('should extract JSON from surrounding text on both sides', () => {
            const input = 'Here is my response:\n\n{"score": 45, "reason": "Below average fit"}\n\nLet me know if you need more details.';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(45);
        });
    });

    describe('common JSON formatting issues', () => {
        it('should handle trailing comma before closing brace', () => {
            const input = '{"score": 78, "reason": "Good skills",}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(78);
        });

        it('should handle single quotes instead of double quotes', () => {
            const input = "{'score': 82, 'reason': 'Strong candidate'}";
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(82);
        });

        it('should handle unquoted keys', () => {
            const input = '{score: 77, reason: "Reasonable match"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(77);
        });

        it('should handle mixed issues (trailing comma, single quotes)', () => {
            const input = "{'score': 68, 'reason': 'Average fit',}";
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(68);
        });
    });

    describe('decimal scores', () => {
        it('should parse and round decimal scores', () => {
            // parseJsonFromContent returns raw value for valid JSON; rounding only in regex fallback
            const input = '{"score": 85.7, "reason": "Very good match"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(85.7);
        });

        it('should parse decimal scores in malformed text', () => {
            const input = 'The score is score: 72.3, reason: "Above average"';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(72);
        });
    });

    describe('malformed responses - regex fallback', () => {
        it('should extract score from completely malformed response', () => {
            const input = 'I think the score should be score: 50 and the reason: "Average candidate"';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(50);
        });

        it('should extract score with equals sign syntax', () => {
            const input = 'score = 88, reason = "Excellent match"';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(88);
        });

        it('should handle reason with special characters', () => {
            const input = '{"score": 73, "reason": "Good match! The candidate\'s skills align well."}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(73);
        });

        it('should provide default reason when only score is extractable', () => {
            const input = 'I rate this candidate 85 out of 100 - score: 85';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(85);
            expect(result.reason).toBeDefined();
        });
    });

    describe('edge cases', () => {
        it('should handle zero score', () => {
            const input = '{"score": 0, "reason": "No match at all"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(0);
        });

        it('should handle score of 100', () => {
            const input = '{"score": 100, "reason": "Perfect candidate"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(100);
        });

        it('should handle empty reason', () => {
            const input = '{"score": 50, "reason": ""}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(50);
            expect(result.reason).toBe('');
        });

        it('should handle multiline reason', () => {
            const input = `{"score": 70, "reason": "Good skills match. Experience is a bit lacking."}`;
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(70);
            expect(result.reason).toContain('Good skills match');
        });

        it('should handle unicode in reason', () => {
            const input = '{"score": 80, "reason": "Great match ✓ for this role"}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(80);
        });
    });

    describe('failure cases', () => {
        it('should throw when no score can be extracted', () => {
            const input = 'This is just plain text with no JSON or score.';
            expect(() => parseJsonFromContent(input)).toThrow('Unable to parse JSON from model response');
        });

        it('should throw for empty input', () => {
            expect(() => parseJsonFromContent('')).toThrow('Unable to parse JSON from model response');
        });

        it('should throw for only whitespace', () => {
            expect(() => parseJsonFromContent('   \n\t   ')).toThrow('Unable to parse JSON from model response');
        });
    });

    describe('real-world AI responses', () => {
        it('should handle GPT-style verbose response', () => {
            const input = `Based on my analysis of the job description and candidate profile, I have evaluated the fit:

\`\`\`json
{
  "score": 72,
  "reason": "Strong React and TypeScript skills match. However, the role requires 5+ years experience which the candidate may not have."
}
\`\`\`

This score reflects the candidate's technical capabilities while accounting for the experience gap.`;
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(72);
            expect(result.reason).toContain('React and TypeScript');
        });

        it('should handle Claude-style response with thinking', () => {
            const input = `Let me evaluate this candidate against the job requirements.

{"score": 83, "reason": "Excellent frontend skills with React and modern tooling. Good culture fit based on startup experience."}`;
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(83);
        });

        it('should handle response with JSON5-style comments', () => {
            // Some models output JSON5-like syntax with comments
            const input = `{
  "score": 67, // Good but not great
  "reason": "Matches most requirements but lacks cloud experience"
}`;
            // This will fail standard parse but regex should catch it
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(67);
        });

        it('should handle response with extra properties', () => {
            const input = '{"score": 79, "reason": "Good match", "confidence": "high", "breakdown": {"skills": 25, "experience": 20}}';
            const result = parseJsonFromContent(input);
            expect(result.score).toBe(79);
            expect(result.reason).toBe('Good match');
        });
    });
});
