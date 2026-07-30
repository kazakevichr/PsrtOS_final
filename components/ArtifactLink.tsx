// Показывает ссылку/скриншот, подтверждающие, что партнёр разместил рекламу
// (adCreativeUrl). Если это ссылка на картинку — маленький кликабельный
// предпросмотр, иначе просто кликабельная ссылка. Если артефакта нет — "Нет".
function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
}

export default function ArtifactLink({ url }: { url: string | null | undefined }) {
  if (!url) return <span className="text-gray-400">Нет</span>;

  if (isImageUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
        <img src={url} alt="Артефакт" className="w-8 h-8 object-cover rounded border border-gray-200" />
        <span className="text-brand-700 hover:underline text-xs whitespace-nowrap">Скрин ↗</span>
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
      Ссылка ↗
    </a>
  );
}
