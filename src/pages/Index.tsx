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
    if (listeningToastId.current) {
      dismissToast(listeningToastId.current);
      listeningToastId.current = null;
    }
    let last = event.results.length - 1;
    const originalSpokenText = event.results[last][0].transcript.trim();
    const initialProcessedText = originalSpokenText.toLowerCase(); 

    console.log('Recognized original:', originalSpokenText);

    let commandCheckText = initialProcessedText;
    if (commandCheckText.endsWith('.')) {
      commandCheckText = commandCheckText.slice(0, -1);
    }

    if (commandCheckText === "ok" || commandCheckText === "okay") {
      if (points.length === 0) {
        showError("Aucun point n'a été dicté avant 'OK'.");
        setIsListening(false);
        return;
      }
      const sum = points.reduce((acc, p) => acc + p, 0);
      setCurrentTotal(sum);
      let announcement = `Total : ${sum} sur ${gradingScale}.`; // Use gradingScale
      if (gradingScale !== 20) { // Compare with numeric gradingScale
        const converted = parseFloat(((sum / gradingScale) * 20).toFixed(1));
        setConvertedTotal(converted);
        announcement += ` Soit ${converted} sur 20.`;
      } else {
        setConvertedTotal(null);
      }
      speakText(announcement);
      setIsListening(false);
      showSuccess("Calcul du total terminé.");
    } else {
      let finalNumber: number | null = null;
      const lowerOriginal = originalSpokenText.toLowerCase();

      const etDemiSuffix = " et demi";
      let numberPartText = "";
      let foundEtDemi = false;

      if (lowerOriginal.endsWith(etDemiSuffix)) {
        numberPartText = lowerOriginal.substring(0, lowerOriginal.length - etDemiSuffix.length).trim();
        foundEtDemi = true;
      } else if (lowerOriginal.endsWith(etDemiSuffix + ".")) { 
        numberPartText = lowerOriginal.substring(0, lowerOriginal.length - (etDemiSuffix + ".").length).trim();
        foundEtDemi = true;
      }
      
      if (foundEtDemi) {
        let processedNumberPart = numberPartText;
        if (numberWords[processedNumberPart]) {
          processedNumberPart = numberWords[processedNumberPart];
        }
        processedNumberPart = processedNumberPart.replace(',', '.');
        const baseNumber = parseFloat(processedNumberPart);
        if (!isNaN(baseNumber)) {
          finalNumber = baseNumber + 0.5;
          console.log(`"et demi" logic: original="${originalSpokenText}", numberPart="${numberPartText}", baseNumber=${baseNumber}, finalNumber=${finalNumber}`);
        }
      }

      if (finalNumber === null) {
        let textToParse = originalSpokenText.toLowerCase();
        if (textToParse.endsWith('.')) {
          textToParse = textToParse.slice(0, -1);
        }
        textToParse = textToParse.replace(',', '.');

        let textForNumberWords = textToParse;
        if (numberWords[textForNumberWords]) {
          textToParse = numberWords[textForNumberWords];
        }
        
        const parsedNum = parseFloat(textToParse);
        if (!isNaN(parsedNum)) {
          finalNumber = parsedNum;
          console.log(`Direct parsing logic: original="${originalSpokenText}", textToParse="${textToParse}", finalNumber=${finalNumber}`);
        }
      }

      if (finalNumber !== null && finalNumber >= 0) {
        setPoints(prev => [...prev, finalNumber]);
      } else {
        showError(`Point non reconnu : "${originalSpokenText}" (traité comme "${initialProcessedText}")`);
        console.log(`Failed to parse: original="${originalSpokenText}", initialProcessedText="${initialProcessedText}"`);
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
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'fr-FR';

    recognition.onresult = (event) => handleRecognitionResultRef.current(event);

    recognition.onerror = (event: any) => {
      if (listeningToastId.current) {
        dismissToast(listeningToastId.current);
        listeningToastId.current = null;
      }
      console.error('Speech recognition error', event.error);
      let errorMessage = "Erreur de reconnaissance vocale";
      if (event.error === 'no-speech') errorMessage = "Aucun son détecté. L'écoute continue...";
      else if (event.error === 'audio-capture') { errorMessage = "Problème avec le microphone."; setIsListening(false); }
      else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { errorMessage = "Permission microphone refusée."; setIsListening(false); }
      else if (event.error === 'network') { errorMessage = "Erreur réseau."; setIsListening(false); }
      else { errorMessage = `Erreur: ${event.error}`; setIsListening(false); }
      if (event.error !== 'no-speech') showError(errorMessage);
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        try { if (recognition) recognition.start(); }
        catch (e) {
          console.error("Recognition failed to restart:", e);
          showError("Reconnaissance arrêtée. Réessayez.");
          setIsListening(false);
        }
      }
    };
    
    recognitionRef.current = recognition;
    synthesisRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) synthesisRef.current.cancel();
      if (listeningToastId.current) dismissToast(listeningToastId.current);
    };
  }, [isSupported, setIsListening]);

  const toggleListening = () => {
    if (!isSupported) { showError("Fonctionnalité non supportée."); return; }
    if (gradingScale <= 0 || isNaN(gradingScale)) {
        showError("Veuillez entrer un barème valide (nombre positif).");
        return;
    }


    if (isListening) {
      setIsListening(false);
      if (listeningToastId.current) { dismissToast(listeningToastId.current); listeningToastId.current = null; }
      showSuccess("Dictée arrêtée.");
    } else {
      if (currentTotal !== null) { setPoints([]); setCurrentTotal(null); setConvertedTotal(null); }
      setIsListening(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          if (listeningToastId.current) dismissToast(listeningToastId.current);
          listeningToastId.current = showLoading("J'écoute... Dites les points ou \"OK\".");
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
    if (isListening) setIsListening(false);
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
          <p>&bull; Choisissez le barème (par ex. 20, 50, 100 ou un nombre personnalisé).</p> {/* Updated instruction */}
          <p>&bull; Cliquez sur "Commencer" et dictez les points (ex: "deux", "un et demi", "0.5").</p>
          <p>&bull; Dites "OK" pour calculer le total.</p> {/* Capitalized first letter */}
          <p>&bull; L'application annonce et affiche le total (et la conversion sur 20 si besoin).</p> {/* Capitalized first letter */}
          <p>&bull; Cliquez sur "Nouvelle Copie" pour réinitialiser.</p> {/* Capitalized first letter */}
        </CardContent>
      </Card>

      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="scale-input" className="block text-sm font-medium mb-1">Barème (sur combien ?) :</label> {/* Updated label */}
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
            <Button onClick={toggleListening} className="flex-1" disabled={!isSupported || gradingScale <= 0 || isNaN(gradingScale)}> {/* Disable if scale is invalid */}
              {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {isListening ? "Arrêter" : "Commencer"}
            </Button>
            <Button onClick={handleNewCopy} variant="outline" className="flex-1" disabled={!isSupported}><FilePlus2 className="mr-2 h-4 w-4" /> Nouvelle Copie</Button>
          </div>
        </CardContent>
      </Card>
      {isListening && (<p className="text-lg font-semibold text-primary animate-pulse"><Mic className="inline-block mr-2" /> J'écoute... Dites les points ou "OK".</p>)}
      {(points.length > 0 || currentTotal !== null) && (
        <Card className="w-full max-w-lg">
          <CardHeader><CardTitle>Points Dictés</CardTitle></CardHeader>
          <CardContent>
            {points.length > 0 ? (<ScrollArea className="h-32 border rounded-md p-2"><ul className="space-y-1">{points.map((p, i) => ( <li key={i} className="text-sm">{p}</li> ))}</ul></ScrollArea>) : ( currentTotal === null && <p className="text-sm text-muted-foreground">Aucun point.</p> )}
          </CardContent>
        </Card>
      )}
      {currentTotal !== null && (
        <Card className="w-full max-w-lg bg-green-50 border-green-200">
          <CardHeader><CardTitle className="text-green-700">Résultat Final</CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className="text-2xl font-bold">Total : {currentTotal} / {gradingScale}</p> {/* Use gradingScale */}
            {gradingScale !== 20 && convertedTotal !== null && ( // Show conversion only if scale is not 20
              <p className="text-xl text-muted-foreground">&rarr; Conversion sur 20 : {convertedTotal} / 20</p> // Clarified text
            )}
            <Button variant="ghost" size="sm" onClick={() => speakText(`Total : ${currentTotal} sur ${gradingScale}.${convertedTotal !== null ? ` Soit ${convertedTotal} sur 20.` : ''}`)} className="mt-2"><Volume2 className="mr-2 h-4 w-4" /> Réécouter</Button>
          </CardContent>
        </Card>
      )}

      {/* Explanation for Share feature limitation */}
      <div className="w-full max-w-lg text-center text-sm text-muted-foreground mt-8">
        <p>Cette application fonctionne directement dans votre navigateur. Pour la partager avec vos collègues, il suffit de leur envoyer le lien de cette page.</p>
      </div>
    </div>
  );
};

export default OralGraderPage;