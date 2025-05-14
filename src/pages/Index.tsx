import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Mic, MicOff, FilePlus2, Volume2, Info, Loader2 } from 'lucide-react';

// Declare SpeechRecognition API types for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    SpeechSynthesisUtterance: any;
    speechSynthesis: any;
  }
}

const numberWords: { [key: string]: string } = {
  'zéro': '0', 'zero': '0', 'un': '1', 'deux': '2', 'trois': '3',
  'quatre': '4', 'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8',
  'neuf': '9', 'dix': '10', 'onze': '11', 'douze': '12', 'treize': '13',
  'quatorze': '14', 'quinze': '15', 'seize': '16', 'de': '2', // 'de' might be misrecognized for 'deux'
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
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // State to indicate parsing/command processing
  const [cumulativeTranscription, setCumulativeTranscription] = useState<string>('');
  const [pendingNumberPart, setPendingNumberPart] = useState<string | null>(null); // State for the number part waiting for 'plus' or command

  const recognitionRef = useRef<any>(null); // Reference to the SpeechRecognition instance
  const synthesisRef = useRef<any>(null);

  // Initialize Speech Synthesis and check for Speech Recognition support
  useEffect(() => {
    if ('speechSynthesis' in window) {
        synthesisRef.current = window.speechSynthesis;
    } else {
        console.warn("Speech Synthesis not supported in this browser.");
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showError("Reconnaissance vocale non supportée par ce navigateur.");
        console.error("Speech Recognition API not supported.");
    } else {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true; // Keep listening until stopped
        recognitionRef.current.interimResults = false; // Only return final results for each segment
        recognitionRef.current.lang = 'fr-FR'; // Set language to French

        recognitionRef.current.onstart = () => {
            setIsRecording(true);
            setIsProcessing(false);
            setCumulativeTranscription(''); // Clear previous transcription
            setPoints([]); // Clear points
            setCurrentTotal(null); // Clear totals
            setConvertedTotal(null);
            setPendingNumberPart(null); // Clear pending part
            showLoading("Enregistrement en cours... Dites les points ou 'OK' ou 'fini'.");
        };

        recognitionRef.current.onresult = (event: any) => {
            setIsProcessing(true); // Indicate processing of the result
            dismissToast(); // Dismiss loading toast

            const latestResultIndex = event.results.length - 1;
            const latestTranscript = event.results[latestResultIndex][0].transcript;

            console.log("Latest segment transcription:", latestTranscript);

            // Update cumulative transcription state
            setCumulativeTranscription(prev => prev + latestTranscript + ' ');

            const cleanedLatestTranscript = latestTranscript.trim().toLowerCase().replace(/\.$/, ''); // Remove trailing period for command check

            // Check for commands
            if (cleanedLatestTranscript === "fini") {
                console.log("'Fini' command detected.");
                // Process any pending part before stopping
                if (pendingNumberPart) {
                    const parsedNum = parseNumberPart(pendingNumberPart);
                    if (parsedNum !== null) {
                        setPoints(prev => [...prev, parsedNum]);
                        console.log("Processed pending part on 'fini':", parsedNum);
                    } else {
                         showError(`Partie en attente non reconnue avant 'fini' : "${pendingNumberPart}"`);
                         console.log(`Failed to parse pending part on 'fini': "${pendingNumberPart}"`);
                    }
                    setPendingNumberPart(null); // Clear pending part
                }
                recognitionRef.current.stop(); // Stop the recognition
                showSuccess("Enregistrement terminé.");
                setIsProcessing(false); // Processing finished
                return; // Stop processing this result further
            }

            if (cleanedLatestTranscript === "ok" || cleanedLatestTranscript === "okay") {
                 console.log("'OK' command detected.");
                 // Process any pending part before announcing total
                 let currentPoints = points; // Use current state value
                 if (pendingNumberPart) {
                     const parsedNum = parseNumberPart(pendingNumberPart);
                     if (parsedNum !== null) {
                         currentPoints = [...points, parsedNum]; // Create new array with pending point
                         setPoints(currentPoints); // Update state
                         console.log("Processed pending part on 'OK':", parsedNum);
                     } else {
                         showError(`Partie en attente non reconnue avant 'OK' : "${pendingNumberPart}"`);
                         console.log(`Failed to parse pending part on 'OK': "${pendingNumberPart}"`);
                     }
                     setPendingNumberPart(null); // Clear pending part
                 }

                 if (currentPoints.length === 0) {
                    speakText("Aucun point n'a été dicté.");
                    showError("Aucun point n'a été dicté avant 'OK'.");
                 } else {
                    // Recalculate total based on potentially updated points state
                    const sum = currentPoints.reduce((acc, p) => acc + p, 0);
                    const converted = gradingScale !== 20 ? parseFloat(((sum / gradingScale) * 20).toFixed(1)) : null;
                    const announcement = converted !== null ? `${converted} sur 20` : `${sum} sur ${gradingScale}`;
                    speakText(announcement);
                    showSuccess("Annonce du total actuel.");
                 }
                 setIsProcessing(false); // Processing finished
                 return; // Stop processing this result further
            }

            // If not a command, process as potential points
            processTranscriptionSegment(latestTranscript);
            setIsProcessing(false); // Processing finished
        };

        recognitionRef.current.onerror = (event: any) => {
            dismissToast();
            console.error("Speech recognition error:", event.error);
            showError(`Erreur de reconnaissance vocale : ${event.error}`);
            setIsRecording(false);
            setIsProcessing(false);
        };

        recognitionRef.current.onend = () => {
            dismissToast();
            console.log("Speech recognition ended.");
            setIsRecording(false);
            setIsProcessing(false);
        };
    }

    // Cleanup function
    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (synthesisRef.current && synthesisRef.current.speaking) {
            synthesisRef.current.cancel();
        }
    };
  }, [points, currentTotal, convertedTotal, pendingNumberPart, speakText, gradingScale, setPoints, setPendingNumberPart, showError]); // Added dependencies for state and callbacks used in handlers

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

  // Process a single transcription segment to extract points based on 'plus'
  const processTranscriptionSegment = useCallback((segment: string) => {
      const processedSegment = segment.trim().toLowerCase();
      if (!processedSegment) return; // Ignore empty segments

      // Combine with pending part from previous segment
      const combinedText = pendingNumberPart ? `${pendingNumberPart} ${processedSegment}` : processedSegment;
      console.log("Processing combined text:", combinedText);

      const parts = combinedText.split('plus').map(part => part.trim()).filter(part => part !== '');

      if (parts.length === 0) {
          console.log(`No 'plus' found in segment, setting as pending: "${combinedText}"`);
          setPendingNumberPart(combinedText); // The whole segment becomes the new pending part
          return;
      }

      const newPoints: number[] = [];
      // Process all parts except the last one
      for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          const parsedNum = parseNumberPart(part);
          if (parsedNum !== null) {
              newPoints.push(parsedNum);
              console.log("Parsed and added point:", parsedNum, "from part:", part);
          } else {
              showError(`Partie non reconnue comme point : "${part}"`);
              console.log(`Failed to parse part "${part}" from combined text "${combinedText}"`);
          }
      }

      // The last part becomes the new pending part
      const lastPart = parts[parts.length - 1];
      setPendingNumberPart(lastPart);
      console.log("Setting new pending part:", lastPart);


      // Add the newly parsed points to the state
      if (newPoints.length > 0) {
          setPoints(prev => [...prev, ...newPoints]);
      }

  }, [pendingNumberPart, setPoints, setPendingNumberPart, showError]); // Add dependencies


  const startRecording = () => {
    if (!recognitionRef.current) {
        showError("Reconnaissance vocale non supportée par ce navigateur.");
        return;
    }
    if (gradingScale <= 0 || isNaN(gradingScale)) {
        showError("Veuillez entrer un barème valide (nombre positif).");
        return;
    }

    try {
      recognitionRef.current.start();
      // States are updated in onstart handler
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      showError("Erreur lors du démarrage de la reconnaissance vocale.");
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      // States are updated in onend handler
    }
  };


  const handleNewCopy = () => {
    setPoints([]);
    setCurrentTotal(null);
    setConvertedTotal(null);
    setCumulativeTranscription('');
    setPendingNumberPart(null); // Clear pending part on new copy
    if (isRecording) {
        stopRecording(); // Stop recording if active
    }
    showSuccess("Prêt pour une nouvelle copie.");
  };

  // Determine button state and text
  const isButtonDisabled = !recognitionRef.current || isProcessing || gradingScale <= 0 || isNaN(gradingScale);
  const buttonText = isRecording ? "Arrêter l'écoute" : (isProcessing ? "Traitement..." : "Commencer l'écoute");
  const buttonIcon = isRecording ? <MicOff className="mr-2 h-4 w-4" /> : (isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />);
  const toggleRecording = isRecording ? stopRecording : startRecording;


  return (
    <div className="container mx-auto p-4 flex flex-col items-center space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Correcteur oral intelligent</h1>
        <p className="text-sm text-muted-foreground">Totali</p>
      </div>

      {!recognitionRef.current && (
         <Card className="w-full max-w-lg bg-red-50 border-red-200">
            <CardHeader><CardTitle className="text-red-700">Fonctionnalité non supportée</CardTitle></CardHeader>
            <CardContent className="text-center">
                <p className="text-sm text-red-600">La reconnaissance vocale n'est pas supportée par votre navigateur. Veuillez utiliser un navigateur compatible (comme Chrome ou Edge).</p>
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
          <p>&bull; Cliquez sur "Commencer l'écoute".</p>
          <p>&bull; Dictez un point, puis dites "plus", puis dictez le point suivant (ex: "deux plus un et demi plus trois").</p>
          <p>&bull; Le dernier point dicté avant une pause ou une commande sera ajouté lorsque vous direz "OK" ou "fini".</p>
          <p>&bull; Dites "OK" pour déclencher l'annonce vocale du total actuel et ajouter le dernier point dicté (l'enregistrement continue).</p>
          <p>&bull; Dites "fini" pour arrêter l'enregistrement et ajouter le dernier point dicté.</p>
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
              disabled={isRecording || isProcessing || !recognitionRef.current}
              placeholder="Ex: 20, 50, 100..."
            />
          </div>
          <div className="flex space-x-2">
            <Button onClick={toggleRecording} className="flex-1" disabled={isButtonDisabled}>
              {buttonIcon}
              {buttonText}
            </Button>
            <Button onClick={handleNewCopy} variant="outline" className="flex-1" disabled={isRecording || isProcessing || !recognitionRef.current}><FilePlus2 className="mr-2 h-4 w-4" /> Nouvelle Copie</Button>
          </div>
        </CardContent>
      </Card>

      {isRecording && (<p className="text-lg font-semibold text-primary animate-pulse"><Mic className="inline-block mr-2" /> Écoute en cours...</p>)}
      {isProcessing && (<p className="text-lg font-semibold text-blue-600 animate-pulse"><Loader2 className="inline-block mr-2 animate-spin" /> Traitement de la transcription...</p>)}


      {cumulativeTranscription && (
         <Card className="w-full max-w-lg">
            <CardHeader><CardTitle>Transcription</CardTitle></CardHeader>
            <CardContent>
                <ScrollArea className="h-32 border rounded-md p-2 text-sm text-muted-foreground">
                    <p className="break-words">{cumulativeTranscription}</p>
                </ScrollArea>
            </CardContent>
         </Card>
      )}

      {pendingNumberPart && (
         <Card className="w-full max-w-lg bg-yellow-50 border-yellow-200">
            <CardHeader><CardTitle className="text-yellow-700">Point en attente</CardTitle></CardHeader>
            <CardContent className="text-sm text-yellow-600">
                <p className="break-words">{pendingNumberPart}</p>
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
          <CardHeader><CardTitle className="text-green-700">Résultat Actuel</CardTitle></CardHeader>
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