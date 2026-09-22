/**
 * Nhận ảnh dán từ clipboard (Ctrl+V).
 *
 * Tách khỏi `Dropzone` vì một lý do cụ thể: người dùng thu gọn được section
 * SOURCE, khi đó Dropzone bị unmount và listener gắn bên trong nó biến mất —
 * phím tắt chết im lặng. Hook này gắn ở App nên luôn sống.
 *
 * Listener ở `window` chứ không phải một phần tử: người dùng bấm Ctrl+V khi
 * focus đang ở bất kỳ đâu.
 */

import { useEffect } from "react";

export function useImagePaste(onFile: (file: File) => void): void {
  useEffect(() => {
    const handle = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0];
      if (file?.type.startsWith("image/")) onFile(file);
    };
    window.addEventListener("paste", handle);
    return () => window.removeEventListener("paste", handle);
  }, [onFile]);
}
