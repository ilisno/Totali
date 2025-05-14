import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Mic, MicOff, FilePlus2, Volume2, Info, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


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
  'zéro': '0', 'zero': '0', 'un': '1', 'en': '1', 'deux': '2', 'trois': '3',
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
  const [pendingNumberPart, setPendingNumberPart] = useState<string | null>(null); // State for the number part waiting for '+' or command

  // Refs to hold the latest state values for event handlers
  const pointsRef = useRef<number[]>([]);
  const pendingNumberPartRef = useRef<string | null>(null);
  const gradingScaleRef = useRef<number>(20);


  const recognitionRef = useRef<any>(null); // Reference to the SpeechRecognition instance
  const synthesisRef = useRef<any>(null);

  // Update refs whenever state changes
  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { pendingNumberPartRef.current = pendingNumberPart; }, [pendingNumberPart]);
  useEffect(() => { gradingScaleRef.current = gradingScale; }, [gradingScale]);


  // Memoize speakText using useCallback
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
  }, [synthesisRef.current, showError]); // Dependencies for speakText

  // Refactored function to process pending part and update points
  const processPendingPart = useCallback(() => {
      console.log("--- Processing Pending Part ---");
      const partToProcess = pendingNumberPartRef.current; // Capture value before clearing ref
      console.log("Pending part (from ref):", partToProcess);

      let pointsAdded = false;
      if (partToProcess) { // Use captured value
          const parsedNum = parseNumberPart(partToProcess); // Use captured value
          console.log(`Attempting to parse "${partToProcess}" ->`, parsedNum); // Log parse result
          if (parsedNum !== null) {
              const updatedPoints = [...pointsRef.current, parsedNum];
              pointsRef.current = updatedPoints; // Update ref
              setPoints(updatedPoints); // Update state
              console.log("Processed and added pending point:", parsedNum);
              pointsAdded = true;
          } else {
               showError(`Partie en attente non reconnue : "${partToProcess}"`); // Use captured value
               console.log(`Failed to parse pending part: "${partToProcess}"`); // Use captured value
          }
          pendingNumberPartRef.current = null; // Update ref
          setPendingNumberPart(null); // Update state
      } else {
          console.log("No pending part to process.");
      }
      console.log("--- End Processing Pending Part ---");
      return pointsAdded; // Return true if a point was added
  }, [parseNumberPart, showError, setPoints, setPendingNumberPart]);


  // Memoize processTranscriptionSegment using useCallback
  const processTranscriptionSegment = useCallback((segment: string) => {
      console.log("--- Processing Segment ---");
      console.log("Initial pendingNumberPart (from ref):", pendingNumberPartRef.current); // Use ref
      console.log("Latest segment:", segment);

      const cleanedSegment = segment.trim().toLowerCase();
      if (!cleanedSegment) {
          console.log("Segment is empty after cleaning. Doing nothing.");
          return; // Ignore empty segments
      }

      // Combine the current pending part (from ref) with the new segment
      let potentialFullSequence = pendingNumberPartRef.current ? `${pendingNumberPartRef.current} ${cleanedSegment}` : cleanedSegment; // Use ref
      console.log("Combined potential full sequence:", potentialFullSequence);

      // *** NEW: Clean the sequence before splitting ***
      // 1. Ensure spaces around '+'
      potentialFullSequence = potentialFullSequence.replace(/\+/g, ' + ');
      // 2. Remove any characters that are not letters, numbers, spaces, or '+'
      potentialFullSequence = potentialFullSequence.replace(/[^a-z0-9\s+]/g, '');
      // 3. Trim leading/trailing spaces and collapse multiple spaces
      potentialFullSequence = potentialFullSequence.trim().replace(/\s+/g, ' ');

      console.log("Cleaned sequence before split:", potentialFullSequence);


      // Split by '+'
      const parts = potentialFullSequence.split('+').map(part => part.trim()).filter(part => part !== '');
      console.log("Split parts by '+' (after trim/filter):", parts);

      const newPoints: number[] = [];
      let newPendingPart: string | null = null;

      if (parts.length > 0) { // Process all parts except the very last one
          const partsToProcess = parts.slice(0, -1); // All parts except the last one
          newPendingPart = parts[parts.length - 1]; // The very last part is the new pending part

          console.log("Parts to process (before last):", partsToProcess);
          console.log("New pending part set to:", newPendingPart);

          for (const part of partsToProcess) {
              console.log(`Attempting to parse part: "${part}"`);
              const parsedNum = parseNumberPart(part);
              if (parsedNum !== null) {
                  newPoints.push(parsedNum);
                  console.log("Parsed and added point:", parsedNum);
              } else {
                  showError(`Partie non reconnue comme point : "${part}"`);
                  console.log(`Failed to parse part "${part}" from sequence "${potentialFullSequence}"`);
              }
          }

      } else {
          // parts.length is 0, which means potentialFullSequence was empty after trim/filter.
          console.log("Processed segment resulted in no parts.");
          newPendingPart = null; // Clear pending if somehow empty
      }

      // Update state and ref
      if (newPoints.length > 0) {
          console.log("Adding new points:", newPoints);
          const updatedPoints = [...pointsRef.current, ...newPoints];
          pointsRef.current = updatedPoints; // Update ref immediately
          setPoints(updatedPoints); // Then update state
      } else {
          console.log("No new points to add.");
      }
      console.log("Updating pendingNumberPart state/ref to:", newPendingPart);
      pendingNumberPartRef.current = newPendingPart; // Update ref immediately
      setPendingNumberPart(newPendingPart); // Then update state
      console.log("--- End Processing Segment ---");

  }, [parseNumberPart, showError, setPoints, setPendingNumberPart]); // Dependencies updated


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
            pointsRef.current = []; // Clear refs too
            pendingNumberPartRef.current = null;
            showLoading("Enregistrement en cours... Dites les points ou 'OK', 'compte' ou 'fini'.");
        };

        recognitionRef.current.onresult = (event: any) => {
            setIsProcessing(true); // Indicate processing of the result
            dismissToast(); // Dismiss loading toast

            const latestResultIndex = event.results.length - 1;
            const latestTranscript = event.results[latestResultIndex][0].transcript;

            console.log("--- onresult ---");
            console.log("Latest segment transcription:", latestTranscript);
            console.log("State before processing (from refs):"); // Indicate using refs
            console.log("  points:", pointsRef.current); // Use ref
            console.log("  pendingNumberPart:", pendingNumberPartRef.current); // Use ref
            console.log("  gradingScale:", gradingScaleRef.current); // Use ref


            // Update cumulative transcription state
            setCumulativeTranscription(prev => prev + latestTranscript + ' ');

            const cleanedLatestTranscript = latestTranscript.trim().toLowerCase().replace(/\.$/, ''); // Remove trailing period for command check

            // Check for commands
            if (cleanedLatestTranscript === "fini") {
                console.log("'Fini' command detected.");
                processPendingPart(); // Process any pending part
                recognitionRef.current.stop(); // Stop the recognition
                showSuccess("Enregistrement terminé.");
                setIsProcessing(false); // Processing finished
                console.log("--- End onresult (Fini) ---");
                return; // Stop processing this result further
            }

            if (cleanedLatestTranscript === "ok" || cleanedLatestTranscript === "okay" || cleanedLatestTranscript === "compte") {
                 console.log(`'${cleanedLatestTranscript}' command detected.`);
                 processPendingPart(); // Process any pending part

                 // Recalculate total based on potentially updated points state (or ref)
                 const sum = pointsRef.current.reduce((acc, p) => acc + p, 0); // Use the potentially updated pointsRef
                 // Use gradingScaleRef.current here
                 const converted = gradingScaleRef.current !== 20 ? parseFloat(((sum / gradingScaleRef.current) * 20).toFixed(1)) : null;
                 const announcement = converted !== null ? `${converted} sur 20` : `${sum} sur ${gradingScaleRef.current}`; // Use ref in announcement text too

                 if (pointsRef.current.length === 0) { // Use ref
                    speakText("Aucun point n'a été dicté.");
                    showError(`Aucun point n'a été dicté avant '${cleanedLatestTranscript}'.`);
                 } else {
                    speakText(announcement);
                    showSuccess(`Annonce du total actuel (${cleanedLatestTranscript}).`);
                 }

                 setIsProcessing(false); // Processing finished
                 console.log(`--- End onresult (${cleanedLatestTranscript}) ---`);
                 return; // Stop processing this result further
            }

            // If not a command, process as potential points
            processTranscriptionSegment(latestTranscript); // This function now uses refs internally
            setIsProcessing(false); // Processing finished
            console.log("--- End onresult (Processed Segment) ---");
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
  }, [speakText, processTranscriptionSegment, processPendingPart, showError, showLoading, dismissToast, setIsRecording, setIsProcessing, setCumulativeTranscription, setPoints, setCurrentTotal, setConvertedTotal, setPendingNumberPart]); // Dependencies updated


  // Update numeric gradingScale when input string changes
  useEffect(() => {
    const parsedScale = parseFloat(gradingScaleInput);
    if (!isNaN(parsedScale) && parsedScale > 0) {
      setGradingScale(parsedScale);
      gradingScaleRef.current = parsedScale; // Update ref here
    } else {
      console.warn("Invalid scale input:", gradingScaleInput);
      // Optionally reset gradingScale/gradingScaleRef.current to a default or previous valid value here if input becomes invalid
    }
  }, [gradingScaleInput, setGradingScale]); // Added setGradingScale dependency

  // Effect to update total and converted total whenever points change
  useEffect(() => {
      const sum = points.reduce((acc, p) => acc + p, 0); // Use state here as this effect reacts to state changes
      setCurrentTotal(sum);
      if (gradingScaleRef.current !== 20) { // Use ref for grading scale
          setConvertedTotal(parseFloat(((sum / gradingScaleRef.current) * 20).toFixed(1)));
      } else {
          setConvertedTotal(null);
      }
  }, [points, gradingScale]); // Dependencies are points and gradingScale state


  const startRecording = () => {
    if (!recognitionRef.current) {
        showError("Reconnaissance vocale non supportée par ce navigateur.");
        return;
    }
    // Use ref for the check before starting
    if (gradingScaleRef.current <= 0 || isNaN(gradingScaleRef.current)) {
        showError("Veuillez entrer un barème valide (nombre positif).");
        return;
    }

    try {
      recognitionRef.current.start();
      // States and refs are updated in onstart handler
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
    pointsRef.current = []; // Clear refs too
    pendingNumberPartRef.current = null;
    if (isRecording) {
        stopRecording(); // Stop recording if active
    }
    showSuccess("Prêt pour une nouvelle copie.");
  };

  // Determine button state and text
  // Use state values for UI rendering
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
          <p>&bull; Le dernier point dicté avant une pause ou une commande sera ajouté lorsque vous direz "OK", "compte" ou "fini".</p>
          <p>&bull; Dites "OK" ou "compte" pour déclencher l'annonce vocale du total actuel et ajouter le dernier point dicté (l'enregistrement continue).</p>
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


      {points.length > 0 && (
        <Card className="w-full max-w-lg">
          <CardHeader><CardTitle>Points Dictés</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-48 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>Point</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {points.map((point, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>{point}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
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