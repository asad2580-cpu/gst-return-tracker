import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx'; // The "Translator" library
import { Button } from "./ui/button"; // Assuming you use a UI library, or use <button>
import { useToast } from "@/hooks/use-toast"; // For feedback

export function BulkImportDialog() {
  const [data, setData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // --- STEP 1: Reading the File ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    // This function runs once the browser finishes reading the bits of the file
    reader.onload = (event) => {
      const binaryData = event.target?.result;
      
      // Convert those bits into a "Workbook" object
      const workbook = XLSX.read(binaryData, { type: 'binary' });
      
      // Grab the first sheet (usually 'Sheet1')
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert that sheet into a clean JavaScript Array
      const json = XLSX.utils.sheet_to_json(worksheet);
      
      setData(json);
      toast({ title: "File Parsed", description: `Found ${json.length} clients.` });
    };

    reader.readAsBinaryString(file);
  };

  // --- STEP 2: Sending to the "Door" (Route) we built ---
  const handleUpload = async () => {
  if (data.length === 0) return;
  setIsUploading(true);

  try {
    // 1. Grab the specific key we saw in your Application tab
    const token = localStorage.getItem('accessToken'); 

    const response = await fetch('/api/clients/bulk', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // 2. Pass the token so requireAdmin can verify you
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok) {
      toast({ title: "Success!", description: result.message });
      setData([]); 
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      // OPTIONAL: Reload the page to show new clients immediately
      window.location.reload(); 
    } else {
      toast({ variant: "destructive", title: "Import Failed", description: result.error });
    }
  } catch (error) {
    toast({ variant: "destructive", title: "Error", description: "Connection failed" });
  } finally {
    setIsUploading(false);
  }
};

  return (
    <div className="space-y-4 p-4 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
      <div className="flex flex-col items-center">
        <h3 className="font-semibold text-lg">Bulk Client Import</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your filled template to add multiple clients at once.
        </p>
        
        {/* DOWNLOAD LINK */}
        <a 
          href="/client_import_template.xlsx" 
          download 
          className="text-primary text-sm font-medium hover:underline mb-4"
        >
          ⬇️ Download Excel Template
        </a>

        {/* FILE INPUT */}
        <input 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileChange}
          ref={fileInputRef}
          className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
        />
      </div>

      {/* CONFIRMATION BUTTON */}
      {data.length > 0 && (
        <div className="flex justify-center mt-4">
          <Button 
            onClick={handleUpload} 
            disabled={isUploading}
            className="w-full max-w-xs"
          >
            {isUploading ? "Processing..." : `Confirm Import (${data.length} Clients)`}
          </Button>
        </div>
      )}
    </div>
  );
}