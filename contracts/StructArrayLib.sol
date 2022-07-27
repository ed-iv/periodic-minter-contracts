/*
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

pragma solidity ^0.8.9;

library StructArrayLib {
    using StructArrayLib for Bids;

    struct Bid {
        address bidder;
        uint256 id;
        uint256 amount;
    }
    
    struct Bids {
      Bid[] _items;
    }

    function pushBid(Bids storage self, Bid memory element) internal {
      if (!exists(self, element)) {
        self._items.push(element);
      }
    }

    function removeBid(Bids storage self, Bid memory element) internal returns (bool) {
        for (uint i = 0; i < self.size(); i++) {
            if (self._items[i].id == element.id) {
                self._items[i] = self._items[self.size() - 1];
                self._items.pop();
                return true;
            }
        }
        return false;
    }

    function getBidAtIndex(Bids storage self, uint256 index) internal view returns (Bid memory) {
        require(index < size(self), "the index is out of bounds");
        return self._items[index];
    }

    function size(Bids storage self) internal view returns (uint256) {
      return self._items.length;
    }

    function exists(Bids storage self, Bid memory element) internal view returns (bool) {
        for (uint i = 0; i < self.size(); i++) {
            if (self._items[i].id == element.id) {
                return true;
            }
        }
        return false;
    }

    function getAllBids(Bids storage self) internal view returns(Bid[] memory) {
        return self._items;
    }

}