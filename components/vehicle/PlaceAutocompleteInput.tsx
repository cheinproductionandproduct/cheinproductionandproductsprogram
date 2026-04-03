'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    google?: typeof google
    __gmapsInit?: () => void
  }
}

type PlaceResult = {
  address: string
  placeId?: string
  lat?: number
  lng?: number
}

interface PlaceAutocompleteInputProps {
  value: string
  onChange: (result: PlaceResult) => void
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
}

/**
 * Load Google Maps script and init Places Autocomplete.
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and Places API enabled.
 */
function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window undefined'))
  if (window.google?.maps?.places) return Promise.resolve(window.google)

  return new Promise((resolve, reject) => {
    const callbackName = '__gmapsInit'
    ;(window as any)[callbackName] = () => {
      if (window.google?.maps?.places) resolve(window.google)
      else reject(new Error('Places not loaded'))
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })
}

export function PlaceAutocompleteInput({
  value,
  onChange,
  placeholder = 'ค้นหาที่อยู่หรือสถานที่',
  id,
  className,
  disabled,
}: PlaceAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setLoadError('ไม่พบ Google Maps API Key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)')
      return
    }

    let cancelled = false
    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !inputRef.current) return
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address', 'establishment'],
          fields: ['formatted_address', 'place_id', 'geometry'],
        })
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const address = place.formatted_address || ''
          const lat = place.geometry?.location?.lat()
          const lng = place.geometry?.location?.lng()
          onChange({ address, placeId: place.place_id, lat, lng })
        })
        autocompleteRef.current = autocomplete
        setReady(true)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'โหลด Google Maps ไม่สำเร็จ')
      })

    return () => {
      cancelled = true
      autocompleteRef.current = null
    }
  }, [onChange])

  return (
    <div className="place-autocomplete-wrap">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange({ address: e.target.value })}
        placeholder={ready ? placeholder : loadError ? 'ใส่ที่อยู่เอง' : 'กำลังโหลดแผนที่...'}
        id={id}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
      {loadError && (
        <p className="form-hint" style={{ marginTop: 4, color: '#888' }}>
          {loadError} — สามารถพิมพ์ที่อยู่เองได้
        </p>
      )}
    </div>
  )
}
