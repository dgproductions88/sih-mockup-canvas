/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper to get intrinsic image dimensions from a File object
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Failed to read file."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = (err) => reject(new Error(`Image load error: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`File reader error: ${err}`));
    });
};

// Helper to crop a square image back to an original aspect ratio, removing padding.
const cropToOriginalAspectRatio = (
    imageDataUrl: string,
    originalWidth: number,
    originalHeight: number,
    targetDimension: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imageDataUrl;
        img.onload = () => {
            const aspectRatio = originalWidth / originalHeight;
            let contentWidth, contentHeight;
            if (aspectRatio > 1) { // Landscape
                contentWidth = targetDimension;
                contentHeight = targetDimension / aspectRatio;
            } else { // Portrait or square
                contentHeight = targetDimension;
                contentWidth = targetDimension * aspectRatio;
            }

            const x = (targetDimension - contentWidth) / 2;
            const y = (targetDimension - contentHeight) / 2;

            const canvas = document.createElement('canvas');
            canvas.width = contentWidth;
            canvas.height = contentHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context for cropping.'));
            }
            
            ctx.drawImage(img, x, y, contentWidth, contentHeight, 0, 0, contentWidth, contentHeight);
            
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = (err) => reject(new Error(`Image load error during cropping: ${err}`));
    });
};


// Resizes the image to fit within a square and adds padding, ensuring a consistent
// input size for the AI model, which enhances stability.
const resizeImage = (file: File, targetDimension: number): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Failed to read file."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetDimension;
                canvas.height = targetDimension;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context.'));
                }

                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, targetDimension, targetDimension);

                const aspectRatio = img.width / img.height;
                let newWidth, newHeight;

                if (aspectRatio > 1) { // Landscape image
                    newWidth = targetDimension;
                    newHeight = targetDimension / aspectRatio;
                } else { // Portrait or square image
                    newHeight = targetDimension;
                    newWidth = targetDimension * aspectRatio;
                }

                const x = (targetDimension - newWidth) / 2;
                const y = (targetDimension - newHeight) / 2;
                
                ctx.drawImage(img, x, y, newWidth, newHeight);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed.'));
                    }
                }, 'image/jpeg', 0.95);
            };
            img.onerror = (err) => reject(new Error(`Image load error: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`File reader error: ${err}`));
    });
};

// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

/**
 * Generates a composite image using a multi-modal AI model.
 * The model takes a product image, a scene image, and a text prompt
 * to generate a new image with the product placed in the scene.
 * @param designImage The file for the design to be placed.
 * @param designDescription A text description of the design.
 * @param contextImage The file for the background environment.
 * @param contextDescription A text description of the context.
 * @returns A promise that resolves to an object containing the base64 data URL of the generated image.
 */
export const generateCompositeImage = async (
    designImage: File, 
    designDescription: string,
    contextImage: File,
    contextDescription: string,
): Promise<{ finalImageUrl: string; }> => {
  console.log('Starting multi-step image generation process...');
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  const { width: originalWidth, height: originalHeight } = await getImageDimensions(contextImage);
  
  const MAX_DIMENSION = 1024;
  
  console.log('Resizing design and context images...');
  const resizedDesignImage = await resizeImage(designImage, MAX_DIMENSION);
  const resizedContextImage = await resizeImage(contextImage, MAX_DIMENSION);

  console.log('Generating semantic location description with gemini-2.5-flash-lite...');
  
  const contextImagePart = await fileToPart(resizedContextImage);

  const descriptionPrompt = `
You are an expert scene analyst. I will provide you with an image of a scene.
Your task is to identify the single most prominent monitor, television, or video wall screen in the entire image.
Provide a dense, semantic description of this specific screen and its location. This description will be used to guide another AI to replace the content on the screen.

Example descriptions:
- "The target is the screen of the black television on the wooden media console, to the left of the white vase."
- "The target is the laptop screen on the desk, which is positioned next to a stack of books and a silver lamp."
- "The target is the large computer monitor with a silver stand in the center of the image."

If you cannot find a suitable screen, as a fallback, describe the most prominent and suitable flat surface for displaying a design.

Provide only the description in a few sentences.
`;
  
  let semanticLocationDescription = '';
  try {
    const descriptionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: { parts: [{ text: descriptionPrompt }, contextImagePart] }
    });
    semanticLocationDescription = descriptionResponse.text;
    console.log('Generated description:', semanticLocationDescription);
  } catch (error) {
    console.error('Failed to generate semantic location description:', error);
    throw new Error("The AI failed to analyze the context image.");
  }

  console.log('Preparing to generate composite image...');
  
  const designImagePart = await fileToPart(resizedDesignImage);
  
  const prompt = `
**Role:**
You are a visual composition expert. Your task is to take a 'design' image and display it on the screen of a monitor/television within a 'context' image. You must completely replace the original content of this screen with the design image.

**Specifications:**
-   **Design to display:**
    The first image provided. This is the image that should appear on the monitor screen. Ignore any black padding around it.
-   **Context to use:**
    The second image provided. This is the context containing the monitor. Ignore any black padding around it.
-   **Target Screen (Crucial):**
    -   You must locate the specific screen in the context as described below. This is the screen whose content you will replace.
    -   **Screen Description:** "${semanticLocationDescription}"
-   **Final Image Requirements:**
    -   The design image must be realistically displayed on the target screen.
    -   Adjust the design image to match the screen's perspective, aspect ratio, and orientation. The design should fill the screen.
    -   The design image must fill the entire screen, completely covering all of its original content.
    -   The final image's overall style, lighting, shadows, and camera perspective must match the original context. The design on the screen should be affected by the context's lighting, including reflections or glare on the screen surface.
    -   Do not simply paste the design. It must look like it is genuinely being displayed on the monitor.
    -   You must not return the original context image without the design displayed on the monitor.

The output should ONLY be the final, composed image. Do not add any text or explanation.
`;

  const textPart = { text: prompt };
  
  console.log('Sending images and augmented prompt...');
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [designImagePart, contextImagePart, textPart] },
  });

  console.log('Received response.');
  
  const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

  if (imagePartFromResponse?.inlineData) {
    const { mimeType, data } = imagePartFromResponse.inlineData;
    console.log(`Received image data (${mimeType}), length:`, data.length);
    const generatedSquareImageUrl = `data:${mimeType};base64,${data}`;
    
    console.log('Cropping generated image to original aspect ratio...');
    const finalImageUrl = await cropToOriginalAspectRatio(
        generatedSquareImageUrl,
        originalWidth,
        originalHeight,
        MAX_DIMENSION
    );
    
    return { finalImageUrl };
  }

  console.error("Model response did not contain an image part.", response);
  throw new Error("The AI model did not return an image. Please try again.");
};