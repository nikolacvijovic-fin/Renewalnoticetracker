package idempotency

type Store struct {
	seen map[string]struct{}
}

func NewStore() *Store {
	return &Store{seen: map[string]struct{}{}}
}

func (store *Store) Claim(key string) bool {
	if key == "" {
		return false
	}
	if _, exists := store.seen[key]; exists {
		return false
	}
	store.seen[key] = struct{}{}
	return true
}
