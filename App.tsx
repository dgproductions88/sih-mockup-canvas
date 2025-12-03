/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect } from 'react';
import { generateCompositeImage } from './services/geminiService';
import { Design } from './types';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import Spinner from './components/Spinner';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

const loadingMessages = [
    "Analyzing your design...",
    "Scanning the context for the best screen...",
    "Describing target screen with AI...",
    "Crafting the perfect screen replacement prompt...",
    "Generating photorealistic view...",
    "Assembling the final context..."
];


const App: React.FC = () => {
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [designImageFile, setDesignImageFile] = useState<File | null>(null);
  const [contextImage, setContextImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  
  const contextImageUrl = contextImage ? URL.createObjectURL(contextImage) : null;
  const designImageUrl = selectedDesign ? selectedDesign.imageUrl : null;

  const handleDesignImageUpload = useCallback((file: File) => {
    setError(null);
    try {
        const imageUrl = URL.createObjectURL(file);
        const design: Design = {
            id: Date.now(),
            name: file.name,
            imageUrl: imageUrl,
        };
        setDesignImageFile(file);
        setSelectedDesign(design);
    } catch(err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Could not load the design image. Details: ${errorMessage}`);
      console.error(err);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!designImageFile || !contextImage || !selectedDesign) {
      setError('An unexpected error occurred. Please upload both a design and context file.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedImageUrl(null);
    try {
      const { finalImageUrl } = await generateCompositeImage(
        designImageFile, 
        selectedDesign.name,
        contextImage,
        contextImage.name
      );

      // Pre-load the image before showing it to avoid a flicker
      const img = new Image();
      img.src = finalImageUrl;
      img.onload = () => {
          setGeneratedImageUrl(finalImageUrl);
          setIsLoading(false);
      };
      img.onerror = () => {
        throw new Error("The generated image could not be loaded.");
      }
    } catch (err)
 {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to generate the image. ${errorMessage}`);
      console.error(err);
      setIsLoading(false);
    }
  }, [designImageFile, contextImage, selectedDesign]);


  const handleReset = useCallback(() => {
    setSelectedDesign(null);
    setDesignImageFile(null);
    setContextImage(null);
    setError(null);
    setIsLoading(false);
    setGeneratedImageUrl(null);
  }, []);

  const handleDownloadImage = useCallback((imageUrl: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'home-canvas-context.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  useEffect(() => {
    return () => {
        if (contextImageUrl) URL.revokeObjectURL(contextImageUrl);
    };
  }, [contextImageUrl]);
  
  useEffect(() => {
    return () => {
        if (designImageUrl && designImageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(designImageUrl);
        }
    };
  }, [designImageUrl]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLoading) {
        setLoadingMessageIndex(0);
        interval = setInterval(() => {
            setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
        }, 3000);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-50 border border-red-200 p-8 rounded-lg max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-4 text-red-800">An Error Occurred</h2>
            <p className="text-lg text-red-700 mb-6">{error}</p>
            <button
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }

    if (isLoading) {
      return (
        <div className="text-center animate-fade-in">
          <Spinner />
          <p className="text-xl mt-4 text-zinc-600 transition-opacity duration-500">{loadingMessages[loadingMessageIndex]}</p>
        </div>
      );
    }

    if (generatedImageUrl) {
        return (
          <div className="w-full max-w-4xl mx-auto animate-fade-in text-center">
            <h2 className="text-3xl font-extrabold mb-5 text-zinc-800">Your Generated Context</h2>
            <div className="rounded-lg overflow-hidden shadow-xl border border-zinc-200">
                <img src={generatedImageUrl} alt="Generated context with design" className="w-full h-full object-contain bg-zinc-100" />
            </div>
            <div className="mt-8 flex justify-center space-x-4">
                <button
                  onClick={() => handleDownloadImage(generatedImageUrl)}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
                >
                  Download
                </button>
                <button
                    onClick={handleReset}
                    className="bg-zinc-700 hover:bg-zinc-800 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
                  >
                    Start Over
                </button>
            </div>
          </div>
        );
    }
    
    return (
      <div className="w-full max-w-6xl mx-auto animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="flex flex-col">
            <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">1. Upload Context</h2>
            <ImageUploader 
              id="scene-uploader"
              onFileSelect={setContextImage}
              imageUrl={contextImageUrl}
            />
          </div>
          <div className="flex flex-col">
            <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">2. Upload Design</h2>
            <ImageUploader 
              id="product-uploader"
              onFileSelect={handleDesignImageUpload}
              imageUrl={designImageUrl}
            />
          </div>
        </div>
        <div className="text-center mt-10 min-h-[6rem] flex flex-col justify-center items-center">
          {designImageFile && contextImage ? (
             <button
              onClick={handleGenerate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-lg text-xl transition-all animate-fade-in shadow-lg hover:shadow-xl"
             >
              3. Generate!
             </button>
          ) : (
            <>
              <p className="text-zinc-500 animate-fade-in">
                Upload a design and a context image to begin.
              </p>
            </>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-white text-zinc-800 flex items-center justify-center p-4 md:p-8">
      <div className="flex flex-col items-center gap-8 w-full">
        <Header />
        <main className="w-full">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;