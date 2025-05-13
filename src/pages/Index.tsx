import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Keep Select imports for now, might remove later
import { Input } from "@/components/ui/input"; // Import Input
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Mic, MicOff, FilePlus2, Volume2, Info } from 'lucide-react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    SpeechSynthesisUtterance: any;
    speechSynthesis: any;
  }
}

// Removed GRADING_SCALES array as we'll use a custom input
const numberWords: { [key: string]: string } = {
  'zéro': '0', 'zero': '0', 'un': '1', 'deux': '2', 'trois': '3',
  'quatre': '4', 'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8',
  'neuf': '9', 'dix': '10', 'onze': '11', 'douze': '12', 'treize': '13',
  'quatorze': '14', 'quinze': '15', 'seize': '16', 'de': '2',
};

const OralGraderPage: React.FC = () => {
  // Use state for the input string and the parsed number
  const [gradingScaleInput, setGradingScaleInput] = useState<string>('20');
  const [gradingScale, setGradingScale] = useState<number>(20); // Numeric value used for calculations

  const [points, setPoints] = useState<number[]>([]);
  const [currentTotal, setCurrentTotal] = useState<number | null>(null);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  const listeningToastId = useRef<string | number | null>(null);

  // Update isListeningRef whenever isListening changes
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Update numeric gradingScale when input string changes
  useEffect(() => {
    const parsedScale = parseFloat(gradingScaleInput);
    if (!isNaN(parsedScale) && parsedScale > 0) {
      setGradingScale(parsedScale);
    } else {
      // If input is invalid, maybe default to 20 or show an error
      // For now, let's just log and keep the previous valid scale
      console.warn("Invalid scale input:", gradingScaleInput);
      // setGradingScale(20); // Option to reset to 20 on invalid input
    }
  }, [gradingScaleInput]);


  const speakText = useCallback((text: string) => {
    if (!synthesisRef.current || !isSupported) return;
    synthesisRef.current.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    synthesisRef.current.speak(utterance);
  }, [isSupported]);

  const handleRecognitionResultCallback = useCallback((event: any) => {
    // Dismiss loading toast once any result comes in
    if (listeningToastId.current) {
      dismissToast(listeningToastId.current);
      listeningToastId.current = null;
    }

    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    const originalSpokenText = finalTranscript.trim();

    if (!originalSpokenText) {
        // If no final transcript in this event, do nothing
        return;
    }

    const initialProcessedText = originalSpokenText.toLowerCase(); 

    console.log('Recognized original (final):', originalSpokenText);

    let commandCheckText = initialProcessedText;
    if (commandCheckText.endsWith('.')) {
      commandCheckText = commandCheckText.slice(0, -1);
    }

    if (commandCheckText === "ok" || commandCheckText === "okay") {
      if (points.length === 0) {
        showError("Aucun point n'a été dicté avant 'OK'.");
        setIsListening(false); // Stop listening
        return; // Don't process as a number
      }
      const sum = points.reduce((acc, p) => acc + p, 0);
      const converted = gradingScale !== 20 ? parseFloat(((sum / gradingScale) * 20).toFixed(1)) : null;

      setCurrentTotal(sum);
      setConvertedTotal(converted);

      // Announce only the final note
      const announcement = converted !== null ? `${converted} sur 20` : `${sum} sur ${gradingScale}`;
      speakText(announcement);

      setIsListening(false); // Stop listening
      showSuccess("Calcul du total terminé.");
    } else {
      // Process for number parsing, potentially multiple numbers separated by "plus"
      const parts = initialProcessedText.split('plus').map(part => part.trim()).filter(part => part !== '');

      if (parts.length === 0) {
          showError(`Point(s) non reconnu(s) : "${originalSpokenText}"`);
          console.log(`Failed to parse: original="${originalSpokenText}", initialProcessedText="${initialProcessedText}"`);
          return; // No valid parts found
      }

      let successfullyParsedCount = 0;
      parts.forEach(part => {
          let finalNumber: number | null = null;
          let processedPart = part; // Start with the part

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
              console.log(`Part "${part}" -> "et demi" logic: numberPart="${numberPartText}", cleanedPrefix="${cleanedPrefix}", baseNumber=${baseNumber}, finalNumber=${finalNumber}`);
            } else {
                 console.log(`Part "${part}" -> "et demi" logic: Failed to parse prefix "${numberPartText}" (cleaned as "${cleanedPrefix}")`);
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
              console.log(`Part "${part}" -> Direct parsing logic: cleanedPart="${cleanedPart}", finalNumber=${finalNumber}`);
            } else {
                 console.log(`Part "${part}" -> Direct parsing logic: Failed to parse "${part}" (cleaned as "${cleanedPart}")`);
            }
          }

          if (finalNumber !== null && finalNumber >= 0) {
            setPoints(prev => [...prev, finalNumber]); // Add each parsed number individually
            successfullyParsedCount++;
          } else {
            // Only show error if parsing failed for this specific part
            showError(`Point non reconnu dans la séquence "${originalSpokenText}" : "${part}"`);
            console.log(`Failed to parse part: original="${originalSpokenText}", part="${part}"`);
          }
      });

      if (parts.length > 0 && successfullyParsedCount === 0) {
          // If no points were successfully parsed from the phrase
          showError(`Aucun point valide trouvé dans la séquence : "${originalSpokenText}"`);
      }
    }
  }, [points, gradingScale, speakText, setIsListening]); // Added gradingScale to dependencies

  const handleRecognitionResultRef = useRef(handleRecognitionResultCallback);
  useEffect(() => {
    handleRecognitionResultRef.current = handleRecognitionResultCallback;
  }, [handleRecognitionResultCallback]);

  useEffect(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) || !('speechSynthesis' in window)) {
      setIsSupported(false);
      showError("Votre navigateur ne supporte pas la reconnaissance ou la synthèse vocale.");
      return;
    }
    setIsSupported(true);

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true; // Set to true for continuous listening
    recognition.interimResults = true; // We need interim results to build the final transcript
    recognition.lang = 'fr-FR';

    recognition.onresult = (event) => handleRecognitionResultRef.current(event);

    recognition.onerror = (event: any) => {
      if (listeningToastId.current) {
        dismissToast(listeningToastId.current);
        listeningToastId.current = null;
      }
      console.error('Speech recognition error', event.error);
      let errorMessage = "Erreur de reconnaissance vocale";
      if (event.error === 'no-speech') {
         // No need to show error toast for no-speech in continuous mode, it just means silence
         console.warn('Speech recognition: no speech detected.');
      } else if (event.error === 'audio-capture') {
        errorMessage = "Problème avec le microphone."; setIsListening(false);
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        errorMessage = "Permission microphone refusée."; setIsListening(false);
      } else if (event.error === 'network') {
        errorMessage = "Erreur réseau."; setIsListening(false);
      } else {
         errorMessage = `Erreur: ${event.error}`; setIsListening(false);
      }
      if (event.error !== 'no-speech') showError(errorMessage);
    };

    recognition.onend = () => {
      // In continuous mode, onend might fire less often or after long pauses.
      // We still want to restart if we are supposed to be listening.
      console.log("Recognition ended. isListeningRef.current:", isListeningRef.current);
      if (isListeningRef.current) {
        try {
            console.log("Attempting to restart recognition...");
            recognition.start();
        } catch (e) {
            console.error("Recognition failed to restart in onend:", e);
            showError("Reconnaissance arrêtée. Veuillez réessayer.");
            setIsListening(false);
        }
      } else {
          console.log("Recognition ended as expected (isListening is false).");
      }
    };
    
    recognitionRef.current = recognition;
    synthesisRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop(); // Stop recognition when component unmounts or effect re-runs
      }
      if (synthesisRef.current) synthesisRef.current.cancel();
      if (listeningToastId.current) dismissToast(listeningToastId.current);
    };
  }, [isSupported, setIsListening]); // Effect depends on isSupported and setIsListening

  const toggleListening = () => {
    if (!isSupported) { showError("Fonctionnalité non supportée."); return; }
    if (gradingScale <= 0 || isNaN(gradingScale)) {
        showError("Veuillez entrer un barème valide (nombre positif).");
        return;
    }

    if (isListening) {
      setIsListening(false); // This will set isListeningRef.current to false
      if (recognitionRef.current) {
          recognitionRef.current.stop(); // Explicitly stop recognition
      }
      if (listeningToastId.current) { dismissToast(listeningToastId.current); listeningToastId.current = null; }
      showSuccess("Dictée arrêtée.");
    } else {
      if (currentTotal !== null) { setPoints([]); setCurrentTotal(null); setConvertedTotal(null); }
      setIsListening(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          if (listeningToastId.current) dismissToast(listeningToastId.current);
          listeningToastId.current = showLoading("J'écoute... Dites les points séparés par \"plus\" ou dites \"OK\".");
        } catch (e) {
          console.error("Error starting recognition:", e);
          showError("Impossible de démarrer la reconnaissance.");
          setIsListening(false);
        }
      }
    }
  };

  const handleNewCopy = () => {
    setPoints([]); setCurrentTotal(null); setConvertedTotal(null);
    if (isListening) {
        setIsListening(false); // This will set isListeningRef.current to false
        if (recognitionRef.current) recognitionRef.current.stop(); // Explicitly stop recognition
    }
    if (listeningToastId.current) { dismissToast(listeningToastId.current); listeningToastId.current = null; }
    showSuccess("Prêt pour une nouvelle copie.");
  };

  if (!isSupported && isSupported !== undefined) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen">
        <Card className="w-full max-w-md"><CardHeader><CardTitle className="text-center text-destructive">Non supporté</CardTitle></CardHeader><CardContent><p className="text-center">Navigateur incompatible. Essayez Chrome/Edge.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 flex flex-col items-center space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Correcteur oral intelligent</h1>
        <p className="text-sm text-muted-foreground">Totali</p> {/* Added Totali */}
      </div>


      <Card className="w-full max-w-lg bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center text-blue-700">
            <Info className="mr-2 h-5 w-5" />
            Comment ça marche ?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-600 space-y-1">
          <p>&bull; Choisissez le barème (par ex. 20, 50, 100 ou un nombre personnalisé).</p>
          <p>&bull; Cliquez sur "Commencer" et dictez les points **séparés par "plus"** (ex: "deux plus un et demi plus trois").</p> {/* Updated instruction */}
          <p>&bull; Dites "OK" pour calculer le total.</p>
          <p>&bull; L'application annonce et affiche le total (et la conversion sur 20 si besoin).</p>
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
              disabled={isListening || currentTotal !== null}
              placeholder="Ex: 20, 50, 100..."
            />
          </div>
          <div className="flex space-x-2">
            <Button onClick={toggleListening} className="flex-1" disabled={!isSupported || gradingScale <= 0 || isNaN(gradingScale)}>
              {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {isListening ? "Arrêter" : "Commencer"}
            </Button>
            <Button onClick={handleNewCopy} variant="outline" className="flex-1" disabled={!isSupported}><FilePlus2 className="mr-2 h-4 w-4" /> Nouvelle Copie</Button>
          </div>
        </CardContent>
      </Card>
      {isListening && (<p className="text-lg font-semibold text-primary animate-pulse"><Mic className="inline-block mr-2" /> J'écoute... Dites les points séparés par "plus" ou dites "OK".</p>)} {/* Updated listening message */}
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
            <Button variant="ghost" size="sm" onClick={() => speakText(convertedTotal !== null ? `${convertedTotal} sur 20` : `${currentTotal} sur ${gradingScale}`)} className="mt-2"><Volume2 className="mr-2 h-4 w-4" /> Réécouter</Button> {/* Updated speak text */}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OralGraderPage;