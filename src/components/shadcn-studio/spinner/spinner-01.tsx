import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'

const SpinnerDemo = () => {
  return (
    <div className='flex w-full max-w-xs flex-col gap-4 rounded'>
      <Item className='bg-muted'>
        <ItemMedia>
          <Spinner />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Uploading assets...</ItemTitle>
        </ItemContent>
        <ItemContent className='flex-none justify-end'>
          <span className='text-sm'>45%</span>
        </ItemContent>
      </Item>
    </div>
  )
}

export default SpinnerDemo
