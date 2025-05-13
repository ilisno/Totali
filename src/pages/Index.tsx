import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Mic, MicOff, FilePlus2, Volume2 } from 'lucide-react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    SpeechSynthesisUtterance: any;
    speechSynthesis: any;
  }
}

const GRADING_SCALES = [10, 20, 50, 100];

const OralGraderPage: React.FC = () => {
  const [selectedScale, setSelectedScale] = useState<number>(20);
  const [points, setPoints] = useState<number[]>([]);
  const [currentTotal, setCurrentTotal] = useState<number | null>(null);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  const listeningToastId = useRef<string | number | null>(null);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const speakText = useCallback((text: string) => {
    if (!synthesisRef.current || !isSupported) return;
    synthesisRef.current.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    synthesisRef.current.speak(utterance);
  }, [isSupported]);

  const handleRecognitionResult = useCallback((event: any) => {
    if (listeningToastId.current) {
      dismissToast(listeningToastId.current);
      listeningToastId.current = null;
    }
    let last = event.results.length - 1;
    let transcript = event.results[last][0].transcript.trim().toLowerCase();
    transcript = transcript.replace(',', '.'); // Handle French decimal format

    console.log('Recognized:', transcript);

    if (transcript === "ok" || transcript === "okay") {
      if (points.length === 0) {
        showError("Aucun point n'a été dicté avant 'OK'.");
        setIsListening(false);
        if (recognitionRef.current) recognitionRef.current.stop();
        return;
      }
      const sum = points.reduce((acc, p) => acc + p, 0);
      setCurrentTotal(sum);
      let announcement = `Total : ${sum} sur ${selectedScale}.`;
      if (selectedScale !== 20) {
        const converted = parseFloat(((sum / selectedScale) * 20).toFixed(1));
        setConvertedTotal(converted);
        announcement += ` Soit ${converted} sur 20.`;
      } else {
        setConvertedTotal(null);
      }
      
      speakText(announcement);
      setIsListening(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      showSuccess("Calcul du total terminé.");
    } else {
      const number = parseFloat(transcript);
      if (!isNaN(number) && number >= 0) {
        setPoints(prevPoints => [...prevPoints, number]);
      } else {
        showError(`Point non reconnu : "${transcript}"`);
      }
    }
  }, [points, selectedScale, speakText]);

  useEffect(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) || !('speechSynthesis' in window)) {
      setIsSupported(false);
      showError("Votre navigateur ne supporte pas la reconnaissance ou la synthèse vocale.");
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognitionAPI();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'fr-FR';

    recognitionRef.current.onresult = handleRecognitionResult;

    recognitionRef.current.onerror = (event: any) => {
      if (listeningToastId.current) {
        dismissToast(listeningToastId.current);
        listeningToastId.current = null;
      }
      console.error('Speech recognition error', event.error);
      let errorMessage = "Erreur de reconnaissance vocale";
      if (event.error === 'no-speech') errorMessage = "Aucun son détecté. Veuillez parler plus fort.";
      else if (event.error === 'audio-capture') errorMessage = "Problème avec le microphone.";
      else if (event.error === 'not-allowed') {
        errorMessage = "Permission d'utiliser le microphone refusée.";
        setIsListening(false);
      }
      showError(errorMessage);
      if (event.error !== 'no-speech') setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      if (isListeningRef.current) {
        try {
            if (recognitionRef.current) recognitionRef.current.start();
        } catch(e) {
            console.warn("Could not restart recognition", e);
            // Potentially set isListening to false if start fails consistently
        }
      }
    };
    
    synthesisRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthesisRef.current) synthesisRef.current.cancel();
      if (listeningToastId.current) dismissToast(listeningToastId.current);
    };
  }, [handleRecognitionResult]);

  const toggleListening = () => {
    if (!isSupported) {
      showError("Fonctionnalité non supportée par votre navigateur.");
      return;
    }
    if (currentTotal !== null) {
        showError("Une copie est déjà notée. Cliquez sur 'Nouvelle Copie' pour continuer.");
        return;
    }

    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (listeningToastId.current) {
        dismissToast(listeningToastId.current);
        listeningToastId.current = null;
      }
      showSuccess("Dictée arrêtée.");
    } else {
      // Clear points only if starting a fresh dictation for the current copy,
      // not if resuming after a manual stop.
      // For simplicity, let's always clear points when "Commencer" is hit.
      setPoints([]); 
      setCurrentTotal(null);
      setConvertedTotal(null);
      setIsListening(true);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          if (listeningToastId.current) dismissToast(listeningToastId.current);
          listeningToastId.current = showLoading("Prêt à écouter... Dites les points.");
        } catch (e) {
          console.error("Error starting recognition:", e);
          showError("Impossible de démarrer la reconnaissance vocale.");
          setIsListening(false);
        }
      }
    }
  };

  const handleNewCopy = () => {
    setPoints([]);
    setCurrentTotal(null);
    setConvertedTotal(null);
    setIsListening(false); 
    if (recognitionRef.current) recognitionRef.current.stop();
    if (listeningToastId.current) {
      dismissToast(listeningToastId.current);
      listeningToastId.current = null;
    }
    showSuccess("Prêt pour une nouvelle copie.");
  };

  if (!isSupported) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle className="text-center text-destructive">Fonctionnalité non supportée</CardTitle></CardHeader>
          <CardContent><p className="text-center">Votre navigateur ne supporte pas les fonctionnalités de reconnaissance ou de synthèse vocale. Essayez avec Chrome ou Edge.</p></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 flex flex-col items-center space-y-6">
      <h1 className="text-3xl font-bold text-center">Correcteur Oral Intelligent</h1>

      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="scale-select" className="block text-sm font-medium mb-1">Barème :</label>
            <Select
              value={selectedScale.toString()}
              onValueChange={(value) => setSelectedScale(parseInt(value))}
              disabled={isListening || currentTotal !== null}
            >
              <SelectTrigger id="scale-select"><SelectValue placeholder="Choisir un barème" /></SelectTrigger>
              <SelectContent>
                {GRADING_SCALES.map(scale => (
                  <SelectItem key={scale} value={scale.toString()}>Sur {scale}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex space-x-2">
            <Button onClick={toggleListening} className="flex-1" disabled={!isSupported || currentTotal !== null}>
              {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {isListening ? "Arrêter la dictée" : "Commencer la dictée"}
            </Button>
            <Button onClick={handleNewCopy} variant="outline" className="flex-1" disabled={!isSupported}>
              <FilePlus2 className="mr-2 h-4 w-4" /> Nouvelle Copie
            </Button>
          </div>
        </CardContent>
      </Card>

      {isListening && (
        <p className="text-lg font-semibold text-primary animate-pulse">
          <Mic className="inline-block mr-2" /> J'écoute... Dites les points ou "OK".
        </p>
      )}

      {(points.length > 0 || currentTotal !== null) && (
        <Card className="w-full max-w-lg">
          <CardHeader><CardTitle>Points Dictés</CardTitle></CardHeader>
          <CardContent>
            {points.length > 0 ? (
              <ScrollArea className="h-32 border rounded-md p-2">
                <ul className="space-y-1">
                  {points.map((point, index) => ( <li key={index} className="text-sm">{point}</li> ))}
                </ul>
              </ScrollArea>
            ) : ( currentTotal === null && <p className="text-sm text-muted-foreground">Aucun point dicté pour cette copie.</p> )}
          </CardContent>
        </Card>
      )}

      {currentTotal !== null && (
        <Card className="w-full max-w-lg bg-green-50 border-green-200">
          <CardHeader><CardTitle className="text-green-700">Résultat Final</CardTitle></CardHeader>
          <CardContent className="text-center">
            <p className="text-2xl font-bold">Total : {currentTotal} / {selectedScale}</p>
            {convertedTotal !== null && ( <p className="text-xl text-muted-foreground">&rarr; {convertedTotal} / 20</p> )}
            <Button variant="ghost" size="sm" onClick={() => speakText(`Total : ${currentTotal} sur ${selectedScale}.${convertedTotal !== null ? ` Soit ${convertedTotal} sur 20.` : ''}`)} className="mt-2">
              <Volume2 className="mr-2 h-4 w-4" /> Réécouter
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OralGraderPage;