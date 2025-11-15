
import React, { useState, useCallback, useEffect } from 'react';
import { ProcessedImage } from './types';
import { UploadIcon, FileIcon, DownloadIcon, TrashIcon, LoadingSpinner } from './components/icons';

// --- Helper Components (defined outside App to prevent re-rendering issues) ---

interface HeaderProps {
    title: string;
    subtitle: string;
}
const Header: React.FC<HeaderProps> = ({ title, subtitle }) => (
    <header className="text-center my-8 md:my-12">
        <div className="flex items-center justify-center gap-4 mb-4">
            <FileIcon className="w-10 h-10 text-sky-400" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">{title}</h1>
        </div>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">{subtitle}</p>
    </header>
);

interface UploadAreaProps {
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}
const UploadArea: React.FC<UploadAreaProps> = ({ onFileChange }) => (
    <div className="w-full max-w-3xl mx-auto mb-8">
        <label htmlFor="file-upload" className="relative block w-full p-8 md:p-12 text-center border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-sky-500 hover:bg-slate-800/50 transition-colors duration-300">
            <UploadIcon className="mx-auto h-12 w-12 text-slate-500 mb-4" />
            <span className="block font-semibold text-slate-300">Click to upload or drag and drop</span>
            <span className="mt-1 block text-sm text-slate-500">PNG, JPG, WEBP, etc.</span>
            <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*" onChange={onFileChange} />
        </label>
    </div>
);

interface ImageGridProps {
    images: ProcessedImage[];
    onRemove: (id: string) => void;
}
const ImageGrid: React.FC<ImageGridProps> = ({ images, onRemove }) => (
    <div className="w-full max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-8">
        {images.map(image => (
            <div key={image.id} className="relative group aspect-square rounded-lg overflow-hidden shadow-lg">
                <img src={image.previewUrl} alt={image.file.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                    <button
                        onClick={() => onRemove(image.id)}
                        className="absolute top-2 right-2 p-1.5 bg-slate-800/70 text-white rounded-full opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all duration-300 hover:bg-red-500"
                        aria-label="Remove image"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        ))}
    </div>
);


// --- Main App Component ---

const App: React.FC = () => {
    const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        const newImages: ProcessedImage[] = Array.from(files)
            .filter((file: File) => file.type.startsWith('image/'))
            .map((file: File) => ({
                id: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
            }));

        setProcessedImages(prev => [...prev, ...newImages]);
        setPdfUrl(null); // Reset PDF URL when new images are added
    }, []);

    const handleRemoveImage = useCallback((id: string) => {
        setProcessedImages(prev => {
            const imageToRemove = prev.find(img => img.id === id);
            if (imageToRemove) {
                URL.revokeObjectURL(imageToRemove.previewUrl);
            }
            return prev.filter(img => img.id !== id);
        });
        setPdfUrl(null);
    }, []);

    const handleClearAll = useCallback(() => {
        // Important: Revoke all object URLs to prevent memory leaks
        processedImages.forEach(image => URL.revokeObjectURL(image.previewUrl));
        setProcessedImages([]);
        setPdfUrl(null);
    }, [processedImages]);
    
    useEffect(() => {
        // Cleanup object URLs on component unmount
        return () => {
            processedImages.forEach(image => URL.revokeObjectURL(image.previewUrl));
        };
    }, [processedImages]);

    const handleConvertToPdf = useCallback(async () => {
        if (processedImages.length === 0) return;
        setIsLoading(true);
        setPdfUrl(null);

        try {
            // @ts-ignore jsPDF is loaded from CDN
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: 'a4',
                hotfixes: ['px_scaling'],
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const padding = 40;

            const loadImageData = (file: File): Promise<HTMLImageElement> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = (err) => reject(new Error(`Failed to load image: ${err.toString()}`));
                        if (typeof e.target?.result === 'string') {
                            img.src = e.target.result;
                        } else {
                            reject(new Error('FileReader result is not a string.'));
                        }
                    };
                    reader.onerror = (err) => reject(new Error(`FileReader error: ${err.toString()}`));
                    reader.readAsDataURL(file);
                });
            };

            for (let i = 0; i < processedImages.length; i++) {
                const image = processedImages[i];
                
                try {
                    const img = await loadImageData(image.file);
                    
                    if (i > 0) {
                        doc.addPage();
                    }

                    const imgWidth = img.width;
                    const imgHeight = img.height;
                    const aspectRatio = imgWidth / imgHeight;

                    let newWidth = pageWidth - padding * 2;
                    let newHeight = newWidth / aspectRatio;

                    if (newHeight > pageHeight - padding * 2) {
                        newHeight = pageHeight - padding * 2;
                        newWidth = newHeight * aspectRatio;
                    }

                    const x = (pageWidth - newWidth) / 2;
                    const y = (pageHeight - newHeight) / 2;

                    const imageFormat = image.file.type.split('/')[1]?.toUpperCase() || 'JPEG';
                    const supportedFormats = ['JPEG', 'PNG', 'WEBP'];
                    const format = supportedFormats.includes(imageFormat) ? imageFormat : 'JPEG';

                    doc.addImage(img, format, x, y, newWidth, newHeight);
                } catch (loadError) {
                    console.error("Error processing image:", image.file.name, loadError);
                    throw new Error(`Failed to process image ${image.file.name}.`);
                }
            }

            const pdfBlob = doc.output('blob');
            const url = URL.createObjectURL(pdfBlob);
            setPdfUrl(url);
        } catch (error) {
            console.error("Failed to convert to PDF:", error);
            alert("An error occurred while creating the PDF. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [processedImages]);


    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            <div className="container mx-auto px-4 flex-grow">
                <Header 
                    title="Image to PDF Converter" 
                    subtitle="Convert your images into a single PDF file with ease. Upload your files, and click convert." 
                />
                
                <main className="flex flex-col items-center">
                    {processedImages.length === 0 && <UploadArea onFileChange={handleFileChange} />}

                    {processedImages.length > 0 && (
                        <>
                            <ImageGrid images={processedImages} onRemove={handleRemoveImage} />
                            
                             <div className="w-full max-w-3xl mx-auto mb-8">
                                <label htmlFor="file-upload-more" className="block w-full py-3 text-center border border-slate-600 rounded-lg cursor-pointer hover:border-sky-500 hover:bg-slate-800/50 transition-colors duration-300 text-slate-300 font-semibold">
                                    Add More Images...
                                </label>
                                <input id="file-upload-more" type="file" className="sr-only" multiple accept="image/*" onChange={handleFileChange} />
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-4 my-8 sticky bottom-4 z-10 p-3 bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-2xl">
                                <button
                                    onClick={handleConvertToPdf}
                                    disabled={isLoading || processedImages.length === 0}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 text-white font-bold rounded-lg shadow-lg hover:bg-sky-500 disabled:bg-slate-700 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
                                >
                                    {isLoading ? (
                                        <>
                                            <LoadingSpinner />
                                            <span>Converting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileIcon className="w-5 h-5" />
                                            <span>Convert to PDF</span>
                                        </>
                                    )}
                                </button>
                                {pdfUrl && (
                                    <a
                                        href={pdfUrl}
                                        download="converted-images.pdf"
                                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg shadow-lg hover:bg-emerald-500 transition-all duration-300 transform hover:scale-105"
                                    >
                                        <DownloadIcon className="w-5 h-5" />
                                        <span>Download PDF</span>
                                    </a>
                                )}
                                <button
                                    onClick={handleClearAll}
                                    disabled={isLoading}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 bg-slate-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors duration-300"
                                    aria-label="Clear all images"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                    <span>Clear All</span>
                                </button>
                            </div>
                        </>
                    )}
                </main>
            </div>
             <footer className="text-center py-4 mt-8 text-slate-500 border-t border-slate-800">
                <p>Powered by React & jsPDF</p>
            </footer>
        </div>
    );
};

export default App;
