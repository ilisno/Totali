import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Keep Select imports for now, might remove later
import { Input } from "@/components/ui/input"; // Import Input
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Mic, MicOff, FilePlus2, Volume2, Info, Loader2 } from 'lucide-react'; // Added Loader2 icon

// Import Whisper WebAssembly library
import { initialize } from '@whisper-at/whisper-web';

declare global {
  interface Window {
    SpeechSynthesisUtterance: any;
    speechSynthesis: any;
  }
}

const numberWords: { [key: string]: string } = {
  'zéro': '0', 'zero': '0', 'un': '1', 'deux': '2', 'trois': '3',
  'quatre': '4', 'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8',
  'neuf': '9', 'dix': '10', 'onze': '11', 'douze': '12', 'treize': '13',
  'quatorze': '14', 'quinze': '15', 'seize': '16', 'de': '2',
};

// Helper function to parse a single text part into a number
const parseNumberPart = (part: string): number | null => {
    let finalNumber: number | null = null;
    let processedPart = part.trim().toLowerCase();

    // Attempt 1: Check for "et demi"
    const etDemiSuffix = " et demi";
    let numberPartText = "";
    let foundEtDemi = false;

    if (processedPart.endsWith(etDemiSuffix)) {
      numberPartText = processedPart.substring(0, processedPart.length - etDemiSuffix.length).trim();
      foundEtDemi = true;
    } else if (processedPart.endsWith(etDemiSuffix + ".")) {
      numberPartText = processedPart.substring(0, processedPart.length - (etDemiSuffix + ".").length).trim();
      foundEtDemi = true;
    }

    if (foundEtDemi) {
      let cleanedPrefix = numberPartText;
      // Map number words in prefix
      for (const word in numberWords) {
          const regex = new RegExp(`\\b${word}\\b`, 'g'); // Use word boundaries
          cleanedPrefix = cleanedPrefix.replace(regex, numberWords[word]);
      }
      // Replace comma/point with period
      cleanedPrefix = cleanedPrefix.replace(/,/g, '.').replace(/point/g, '.');
      // Remove spaces around period
      cleanedPrefix = cleanedPrefix.replace(/\s*\.\s*/g, '.');

      const baseNumber = parseFloat(cleanedPrefix);
      if (!isNaN(baseNumber)) {
        finalNumber = baseNumber + 0.5;
      }
    }

    // Attempt 2: Direct parsing (if "et demi" failed or didn't apply)
    if (finalNumber === null) {
      let cleanedPart = processedPart;
      // Remove trailing period
      if (cleanedPart.endsWith('.')) {
           cleanedPart = cleanedPart.slice(0, -1);
      }

      // Map number words
      for (const word in numberWords) {
           const regex = new RegExp(`\\b${word}\\b`, 'g'); // Use word boundaries
           cleanedPart = cleanedPart.replace(regex, numberWords[word]);
      }

      // Replace comma/point with period
      cleanedPart = cleanedPart.replace(/,/g, '.').replace(/point/g, '.');

      // Remove spaces around period
      cleanedPart = cleanedPart.replace(/\s*\.\s*/g, '.');

      const parsedNum = parseFloat(cleanedPart);
      if (!isNaN(parsedNum)) {
        finalNumber = parsedNum;
      }
    }

    return (finalNumber !== null && finalNumber >= 0) ? finalNumber : null; // Allow 0 points
};


const OralGraderPage: React.FC = () => {
  const [gradingScaleInput, setGradingScaleInput] = useState<string>('20');
  const [gradingScale, setGradingScale] = useState<number>(20);

  const [points, setPoints] = useState<number[]>([]);
  const [currentTotal, setCurrentTotal] = useState<number | null>(null);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [modelLoadingProgress, setModelLoadingProgress] = useState<number | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [transcribedText, setTranscribedText] = useState<string>(''); // To display the raw transcription

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const whisperProcessorRef = useRef<any>(null); // Reference to the Whisper processor
  const synthesisRef = useRef<any>(null);

  // Model path - Make sure tiny-fr.bin is in your public folder
  const modelPath = '/tiny-fr.bin'; // Or '/base-fr.bin' etc.

  // Initialize Whisper processor and load model
  useEffect(() => {
    const loadModel = async () => {
      setModelLoadingProgress(0);
      try {
        const processor = await initialize(modelPath, (progress) => {
          setModelLoadingProgress(Math.round(progress * 100));
        });
        whisperProcessorRef.current = processor;
        setModelLoaded(true);
        setModelLoadingProgress(null); // Hide progress bar
        showSuccess("Modèle Whisper chargé !");
      } catch (error) {
        console.error("Error loading Whisper model:", error);
        showError("Erreur lors du chargement du modèle Whisper.");
        setModelLoadingProgress(null);
      }
    };

    if (!whisperProcessorRef.current && !modelLoaded) {
      loadModel();
    }

    // Initialize Speech Synthesis
    if ('speechSynthesis' in window) {
        synthesisRef.current = window.speechSynthesis;
    } else {
        console.warn("Speech Synthesis not supported in this browser.");
    }


    // Cleanup function
    return () => {
        // No explicit destroy for whisper-web processor needed based on docs
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };
  }, []); // Empty dependency array means this runs once on mount

  // Update numeric gradingScale when input string changes
  useEffect(() => {
    const parsedScale = parseFloat(gradingScaleInput);
    if (!isNaN(parsedScale) && parsedScale > 0) {
      setGradingScale(parsedScale);
    } else {
      console.warn("Invalid scale input:", gradingScaleInput);
    }
  }, [gradingScaleInput]);

  // Effect to update total and converted total whenever points change
  useEffect(() => {
      const sum = points.reduce((acc, p) => acc + p, 0);
      setCurrentTotal(sum);
      if (gradingScale !== 20) {
          setConvertedTotal(parseFloat(((sum / gradingScale) * 20).toFixed(1)));
      } else {
          setConvertedTotal(null);
      }
  }, [points, gradingScale]); // Recalculate when points or gradingScale change


  const speakText = useCallback((text: string) => {
    if (!synthesisRef.current) {
        console.warn("Speech Synthesis not available.");
        showError("Synthèse vocale non supportée.");
        return;
    }
    synthesisRef.current.cancel(); // Stop any ongoing speech
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR'; // Set language to French
    synthesisRef.current.speak(utterance);
  }, []);

  const startRecording = async () => {
    if (!modelLoaded) {
        showError("Le modèle Whisper n'est pas encore chargé.");
        return;
    }
    if (gradingScale <= 0 || isNaN(gradingScale)) {
        showError("Veuillez entrer un barème valide (nombre positif).");
        return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = []; // Clear chunks

        // Process the audio blob with Whisper
        await processAudio(audioBlob);

        // Stop microphone stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setTranscribedText(''); // Clear previous transcription
      // Clear points and totals when starting a new recording session
      setPoints([]);
      setCurrentTotal(null);
      setConvertedTotal(null);
      showLoading("Enregistrement en cours... Cliquez à nouveau pour arrêter.");

    } catch (error) {
      console.error("Error starting recording:", error);
      showError("Impossible d'accéder au microphone. Vérifiez les permissions.");
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // onstop event handler will set isRecording(false) and start processing
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    if (!whisperProcessorRef.current) {
      showError("Le processeur Whisper n'est pas disponible.");
      setIsProcessing(false);
      return;
    }

    try {
      // Convert Blob to AudioBuffer (Whisper-web expects AudioBuffer)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Ensure audio is 16kHz mono float32 as expected by Whisper
      // The library might handle resampling, but it's good practice to be aware.
      // Let's assume the library handles necessary conversions for simplicity first.
      // If issues arise, we might need to add explicit resampling here.

      showLoading("Transcription en cours...");
      const result = await whisperProcessorRef.current.transcribe(audioBuffer);
      dismissToast(); // Dismiss loading toast

      const transcription = result.text.trim();
      setTranscribedText(transcription);
      showSuccess("Transcription terminée !");
      console.log("Transcription:", transcription);

      // --- Parsing and Calculation Logic (re-used from previous version) ---
      const initialProcessedText = transcription.toLowerCase();
      let commandCheckText = initialProcessedText;
      if (commandCheckText.endsWith('.')) {
        commandCheckText = commandCheckText.slice(0, -1);
      }

      if (commandCheckText === "ok" || commandCheckText === "okay") {
        if (points.length === 0) {
          showError("Aucun point n'a été dicté avant 'OK'.");
        } else {
            // Total is already calculated in useEffect based on points state
            const announcement = convertedTotal !== null ? `${convertedTotal} sur 20` : `${currentTotal} sur ${gradingScale}`;
            speakText(announcement);
            showSuccess("Calcul du total terminé.");
        }
      } else {
        const parts = initialProcessedText.split('plus').map(part => part.trim()).filter(part => part !== '');

        if (parts.length === 0) {
            showError(`Aucun point ou commande 'OK' reconnu dans la transcription : "${transcription}"`);
        } else {
            let anyPartParsedSuccessfully = false;
            const newlyParsedPoints: number[] = [];

            parts.forEach(part => {
                const parsedNum = parseNumberPart(part);
                if (parsedNum !== null) {
                  newlyParsedPoints.push(parsedNum);
                  anyPartParsedSuccessfully = true;
                } else {
                  showError(`Point non reconnu dans la séquence "${transcription}" : "${part}"`);
                  console.log(`Failed to parse part: original="${transcription}", part="${part}"`);
                }
            });

            if (anyPartParsedSuccessfully) {
                setPoints(prev => [...prev, ...newlyParsedPoints]); // Add all newly parsed points
                // Total calculation happens in the useEffect triggered by setPoints
            } else {
                showError(`Aucun point valide trouvé dans la séquence : "${transcription}"`);
            }
        }
      }
      // --- End Parsing and Calculation Logic ---

    } catch (error) {
      console.error("Error processing audio with Whisper:", error);
      showError("Erreur lors de la transcription audio.");
    } finally {
      setIsProcessing(false);
    }
  };


  const handleNewCopy = () => {
    setPoints([]);
    setCurrentTotal(null);
    setConvertedTotal(null);
    setTranscribedText('');
    if (isRecording) {
        stopRecording(); // Stop recording if active
    }
    // No need to stop Whisper processor, it stays loaded
    showSuccess("Prêt pour une nouvelle copie.");
  };

  // Determine button state and text
  const isButtonDisabled = !modelLoaded || isProcessing || gradingScale <= 0 || isNaN(gradingScale);
  const buttonText = isRecording ? "Arrêter l'enregistrement" : (isProcessing ? "Traitement..." : "Commencer l'enregistrement");
  const buttonIcon = isRecording ? <MicOff className="mr-2 h-4 w-4" /> : (isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />);
  const toggleRecording = isRecording ? stopRecording : startRecording;


  return (
    <div className="container mx-auto p-4 flex flex-col items-center space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Correcteur oral intelligent</h1>
        <p className="text-sm text-muted-foreground">Totali</p>
      </div>

      {!modelLoaded && modelLoadingProgress !== null && (
         <Card className="w-full max-w-lg bg-yellow-50 border-yellow-200">
            <CardHeader><CardTitle className="text-yellow-700">Chargement du modèle Whisper</CardTitle></CardHeader>
            <CardContent className="text-center">
                <p className="text-sm text-yellow-600 mb-2">Veuillez patienter pendant le téléchargement du modèle de reconnaissance vocale ({modelLoadingProgress}%).</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${modelLoadingProgress}%` }}></div>
                </div>
            </CardContent>
         </Card>
      )}

      <Card className="w-full max-w-lg bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center text-blue-700">
            <Info className="mr-2 h-5 w-5" />
            Comment ça marche ?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-600 space-y-1">
          <p>&bull; Choisissez le barème (par ex. 20, 50, 100 ou un nombre personnalisé).</p>
          <p>&bull; Cliquez sur "Commencer l'enregistrement".</p>
          <p>&bull; Dictez tous les points pour la copie, séparés par "plus" (ex: "deux plus un et demi plus trois"). Vous pouvez dicter plusieurs séquences.</p>
          <p>&bull; Cliquez sur "Arrêter l'enregistrement".</p>
          <p>&bull; L'application transcrit l'audio, calcule le total, et annonce/affiche le résultat.</p>
          <p>&bull; Dites "OK" *pendant l'enregistrement* pour déclencher le calcul et l'annonce vocale du total *sans arrêter l'enregistrement* (utile pour vérifier le total en cours de dictée).</p> {/* Added OK command during recording */}
          <p>&bull; Cliquez sur "Nouvelle Copie" pour réinitialiser.</p>
        </CardContent>
      </Card>

      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="scale-input" className="block text-sm font-medium mb-1">Barème (sur combien ?) :</label>
            <Input
              id="scale-input"
              type="number"
              value={gradingScaleInput}
              onChange={(e) => setGradingScaleInput(e.target.value)}
              min="1"
              disabled={isRecording || isProcessing || !modelLoaded}
              placeholder="Ex: 20, 50, 100..."
            />
          </div>
          <div className="flex space-x-2">
            <Button onClick={toggleRecording} className="flex-1" disabled={isButtonDisabled}>
              {buttonIcon}
              {buttonText}
            </Button>
            <Button onClick={handleNewCopy} variant="outline" className="flex-1" disabled={isRecording || isProcessing || !modelLoaded}><FilePlus2 className="mr-2 h-4 w-4" /> Nouvelle Copie</Button>
          </div>
        </CardContent>
      </Card>

      {isRecording && (<p className="text-lg font-semibold text-primary animate-pulse"><Mic className="inline-block mr-2" /> Enregistrement en cours...</p>)}
      {isProcessing && (<p className="text-lg font-semibold text-blue-600 animate-pulse"><Loader2 className="inline-block mr-2 animate-spin" /> Traitement audio...</p>)}

      {transcribedText && (
         <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Transcription</CardTitle></CardHeader>
            <CardContent>
                <ScrollArea className="h-24 border rounded-md p-2 text-sm text-muted-foreground">
                    <p className="break-words">{transcribedText}</p>
                </ScrollArea>
            </CardContent>
         </Card>
      )}

      {(points.length > 0 || currentTotal !== null) && (
        <Card className="w-full max-w-lg">
          <CardHeader><CardTitle>Points Dictés</CardTitle></CardHeader>
          <CardContent>
            {points.length > 0 ? (
              <ScrollArea className="h-32 border rounded-md p-2">
                {/* Display points in a single line */}
                <p className="text-sm break-words">{points.join(' + ')}</p>
              </ScrollArea>
            ) : ( currentTotal === null && <p className="text-sm text-muted-foreground">Aucun point.</p> )}
          </CardContent>
        </Card>
      )}
      {currentTotal !== null && (
        <Card className="w-full max-w-lg bg-green-50 border-green-200">
          <CardHeader><CardTitle className="text-green-700">Résultat Final</CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className="text-2xl font-bold">Total : {currentTotal} / {gradingScale}</p>
            {gradingScale !== 20 && convertedTotal !== null && (
              <p className="text-xl text-muted-foreground">&rarr; Conversion sur 20 : {convertedTotal} / 20</p>
            )}
            <Button variant="ghost" size="sm" onClick={() => speakText(convertedTotal !== null ? `${convertedTotal} sur 20` : `${currentTotal} sur ${gradingScale}`)} className="mt-2"><Volume2 className="mr-2 h-4 w-4" /> Réécouter</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OralGraderPage;