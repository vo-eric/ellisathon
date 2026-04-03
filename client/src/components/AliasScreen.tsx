interface AliasScreenProps {
  aliasInput: string;
  onAliasInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AliasScreen({
  aliasInput,
  onAliasInputChange,
  onSubmit,
}: AliasScreenProps) {
  return (
    <div className='card'>
      <h1>wikirace</h1>
      <p className='subtitle'>
        7,141,000+ articles
        <br />
        infinite ways to connect them
      </p>
      <form className='alias-form' onSubmit={onSubmit}>
        <input
          type='text'
          placeholder='enter your name'
          maxLength={20}
          autoComplete='off'
          value={aliasInput}
          onChange={(e) => onAliasInputChange(e.target.value)}
          required
        />
        <button type='submit'>start</button>
      </form>
      <div className='cover-footer'>
        <img src='/peas.png' alt='peas' className='cover-footer-img' />
        <p>by team pea</p>
      </div>
    </div>
  );
}
