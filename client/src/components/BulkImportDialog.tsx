import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx'; 
import { Button } from "./ui/button"; 
import { useToast } from "@/hooks/use-toast"; 

// 1. We added { onSuccess } here so the parent page can tell us how to refresh
export function BulkImportDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [data, setData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const binaryData = event.target?.result;
      const workbook = XLSX.read(binaryData, { type: 'binary' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawJson = XLSX.utils.sheet_to_json(worksheet);
      
      // 2. CLEANING LOGIC: This fixes the "undefined" errors by mapping headers
      const cleanedData = rawJson.map((row: any) => ({
        name: row.name || row.Name || "",
        gstin: row.gstin || row.GSTIN || "",
        staffEmail: row.staffEmail || row.staffemail || row['Staff Email'] || "",
        gstUsername: row.gstUsername || row.gstusername || null,
        gstPassword: row.gstPassword || row.gstpassword || null,
        remarks: row.remarks || ""
      }));
      
      setData(cleanedData);
      toast({ title: "File Parsed", description: `Found ${cleanedData.length} clients.` });
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (data.length === 0) return;
    setIsUploading(true);

    try {
      const token = localStorage.getItem('accessToken'); 

      const response = await fetch('/api/clients/bulk', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        toast({ title: "Success!", description: result.message });
        setData([]); 
        if (fileInputRef.current) fileInputRef.current.value = "";
        
        // 3. REPLACEMENT: Instead of window.location.reload(), we call the refresh function
        if (onSuccess) {
          onSuccess(); 
        }
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
        <p className="text-sm text-muted-foreground mb-4">Upload template to add multiple clients.</p>
        
        <a href="/client_import_template.xlsx" download className="text-primary text-sm font-medium hover:underline mb-4">
          ⬇️ Download Excel Template
        </a>

        <input 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileChange}
          ref={fileInputRef}
          className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
        />
      </div>

      {data.length > 0 && (
        <div className="flex justify-center mt-4">
          <Button onClick={handleUpload} disabled={isUploading} className="w-full max-w-xs">
            {isUploading ? "Processing..." : `Confirm Import (${data.length} Clients)`}
          </Button>
        </div>
      )}
    </div>
  );
}