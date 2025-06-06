import { TenderResponse } from '../types/tender';

function parseResponse(text: string): TenderResponse | null {
  try {
    // Extract JSON from the text block
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      return null;
    }

    const jsonStr = jsonMatch[1];
    return JSON.parse(jsonStr) as TenderResponse;
  } catch (error) {
    console.error('Error parsing Claude response:', error);
    return null;
  }
}

export default parseResponse;
