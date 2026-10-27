package feed

import "container/list"

const DefaultLookupSize = 5000

// lookup is a bounded LRU of every post the relay has seen (held, shown, gated out or evicted from the ring),
// for GET /post/{id}. Entries are shared with the ring, so merges into a ring post are visible here too.
type lookup struct {
	size  int
	order *list.List // front = most recent; values are *entry
	byID  map[string]*list.Element
}

func newLookup(size int) *lookup {
	if size <= 0 {
		size = DefaultLookupSize
	}
	return &lookup{size: size, order: list.New(), byID: make(map[string]*list.Element, size)}
}

func (l *lookup) get(id string) *entry {
	if el, ok := l.byID[id]; ok {
		return el.Value.(*entry)
	}
	return nil
}

func (l *lookup) put(e *entry) {
	if el, ok := l.byID[e.post.ID]; ok {
		el.Value = e
		l.order.MoveToFront(el)
		return
	}
	l.byID[e.post.ID] = l.order.PushFront(e)
	if l.order.Len() > l.size {
		oldest := l.order.Back()
		l.order.Remove(oldest)
		delete(l.byID, oldest.Value.(*entry).post.ID)
	}
}

func (l *lookup) remove(id string) {
	if el, ok := l.byID[id]; ok {
		l.order.Remove(el)
		delete(l.byID, id)
	}
}
